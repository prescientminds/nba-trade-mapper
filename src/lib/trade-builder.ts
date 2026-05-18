/**
 * Trade Machine — pure logic + types.
 *
 * Lifted verbatim out of the standalone `TradeMachineClient.tsx` and
 * `TeamColumn.tsx` so both the standalone `/trade-machine` page and the
 * canvas-native side panel (Phase B) import the same builder logic. No
 * UI imports here — only `comparables` and `trade-validation`.
 */

import {
  type PlayerProfile,
  type TeamSide,
  type TradeProfile,
} from './comparables';
import {
  getCBAEra,
  maxIncomingSalary,
  validatePickRules,
  type PickAsset,
  type TeamPickContext,
} from './trade-validation';

export const CURRENT_SEASON = '2025-26';
export const CURRENT_YEAR = 2026;
// v1 scope: 2 teams, current season only. Multi-team + historical seasons in v2.

// ── Types ──────────────────────────────────────────────────────────

export interface RosterPlayer {
  player_name: string;
  age: number | null;
  bpm: number | null;
  salary: number | null;
  /** Contract years remaining AFTER 2025-26 (0 = expiring). */
  contractYearsRemaining: number | null;
}

export interface OutgoingPick {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  /**
   * 'pick' = outright pick. 'swap' = swap right (the holder controls a
   * swap option, not the underlying selection). Sourced from
   * pick-protections.json via build-pick-ownership.ts.
   */
  asset_class: 'pick' | 'swap';
  conditional: boolean;
  lineage: Array<{
    trade_id: string;
    date: string;
    from_team_id: string | null;
    to_team_id: string | null;
    description_snippet: string;
  }>;
}

/** A pick entry loaded from /data/pick-ownership.json. */
export interface OwnedPick {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  current_owner_team_id: string;
  asset_class: 'pick' | 'swap';
  conditional: boolean;
  lineage: OutgoingPick['lineage'];
}

export interface BuilderState {
  teamId: string | null;
  roster: RosterPlayer[];
  selectedPlayerNames: Set<string>;
  picks: OutgoingPick[];
}

// ── Ownership data load ────────────────────────────────────────────
// Module-level cache — pick-ownership.json is static and only needs to be
// fetched once per page load, not once per team column.

let ownershipCache: Record<string, OwnedPick[]> | null = null;
let ownershipPromise: Promise<Record<string, OwnedPick[]>> | null = null;
export async function loadOwnership(): Promise<Record<string, OwnedPick[]>> {
  if (ownershipCache) return ownershipCache;
  if (ownershipPromise) return ownershipPromise;
  ownershipPromise = fetch('/data/pick-ownership.json')
    .then((r) => r.json())
    .then((j) => {
      ownershipCache = j.teams as Record<string, OwnedPick[]>;
      return ownershipCache!;
    });
  return ownershipPromise;
}

// ── State factory ──────────────────────────────────────────────────

export function emptyState(teamId: string | null): BuilderState {
  return {
    teamId,
    roster: [],
    selectedPlayerNames: new Set(),
    picks: [],
  };
}

// ── Helpers that work against BuilderState ─────────────────────────

export function outgoingPlayersOf(state: BuilderState) {
  return state.roster.filter((r) => state.selectedPlayerNames.has(r.player_name));
}

export function outgoingSalaryOf(state: BuilderState): { total: number; complete: boolean } {
  const outgoing = outgoingPlayersOf(state);
  let total = 0;
  let complete = outgoing.length > 0;
  for (const p of outgoing) {
    if (p.salary != null) total += p.salary;
    else complete = false;
  }
  return { total, complete };
}

export function fmtM(dollars: number): string {
  return `${(dollars / 1e6).toFixed(1)}M`;
}

// ── Legality ───────────────────────────────────────────────────────

export interface LegalityVerdict {
  status: 'legal' | 'illegal' | 'incomplete';
  reason: string;
}

export function evaluateLegality(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
): LegalityVerdict {
  if (!left.teamId || !right.teamId) {
    return { status: 'incomplete', reason: 'Pick a team on each side' };
  }
  if (left.teamId === right.teamId) {
    return { status: 'illegal', reason: 'Both sides are the same team' };
  }
  const leftAssetCount = left.selectedPlayerNames.size + left.picks.length;
  const rightAssetCount = right.selectedPlayerNames.size + right.picks.length;
  if (leftAssetCount === 0 || rightAssetCount === 0) {
    return { status: 'incomplete', reason: 'Each side must send at least one asset' };
  }

  // Draft pick rules — Stepien + seven-year cap. Independent of salary
  // matching, so check first; if a pick rule is violated the trade is dead
  // regardless of money.
  const pickRuleResult = checkPickRules(left, right, ownership);
  if (!pickRuleResult.legal) {
    return {
      status: 'illegal',
      reason: pickRuleResult.violations[0].reason,
    };
  }

  const { total: leftSalary, complete: leftComplete } = outgoingSalaryOf(left);
  const { total: rightSalary, complete: rightComplete } = outgoingSalaryOf(right);
  const bothHaveSalary =
    leftComplete && rightComplete &&
    left.selectedPlayerNames.size > 0 && right.selectedPlayerNames.size > 0;

  // CBA matching check — assumes both teams are over the cap, which is the
  // conservative call. Under-cap absorptions would also pass this gate.
  if (bothHaveSalary) {
    const era = getCBAEra('2026-02-01'); // 2025-26 mid-season → 2023 CBA
    const leftMaxIn = maxIncomingSalary(leftSalary, era);
    const rightMaxIn = maxIncomingSalary(rightSalary, era);
    if (rightSalary > leftMaxIn) {
      return {
        status: 'illegal',
        reason: `Team A sends $${fmtM(leftSalary)} but would take back $${fmtM(rightSalary)} (cap allows $${fmtM(leftMaxIn)})`,
      };
    }
    if (leftSalary > rightMaxIn) {
      return {
        status: 'illegal',
        reason: `Team B sends $${fmtM(rightSalary)} but would take back $${fmtM(leftSalary)} (cap allows $${fmtM(rightMaxIn)})`,
      };
    }
    return { status: 'legal', reason: `Trade meets 2023 CBA matching rules (sending $${fmtM(leftSalary)} / $${fmtM(rightSalary)})` };
  }

  return { status: 'legal', reason: 'Trade has assets on both sides' };
}

// Build the per-team Stepien context from pick-ownership.json: for each
// team, list every future-draft year where its own 1st is already owed
// elsewhere (excluding picks selected in this trade — validatePickRules
// folds those in itself).
export function checkPickRules(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
) {
  if (!left.teamId || !right.teamId) {
    return { legal: true, violations: [] as { reason: string }[] };
  }

  const outgoingByTeam: Record<string, PickAsset[]> = {
    [left.teamId]: left.picks.map((p) => ({
      pick_key: p.pick_key,
      year: p.year,
      round: p.round,
      original_team_id: p.original_team_id,
      asset_class: p.asset_class,
    })),
    [right.teamId]: right.picks.map((p) => ({
      pick_key: p.pick_key,
      year: p.year,
      round: p.round,
      original_team_id: p.original_team_id,
      asset_class: p.asset_class,
    })),
  };

  const teamContexts: Record<string, TeamPickContext> = {};
  for (const teamId of [left.teamId, right.teamId]) {
    teamContexts[teamId] = {
      teamId,
      ownFirstsAlreadyOwed: ownedAwayOwnFirsts(teamId, ownership),
    };
  }

  return validatePickRules(outgoingByTeam, teamContexts, CURRENT_YEAR);
}

// Across the full ownership map, find this team's own future 1sts that
// some other team currently owns OUTRIGHT (not as a swap right). A swap
// right doesn't transfer the underlying pick — the original team still
// drafts unless the swap is exercised — so swap-class entries don't
// count against Stepien.
export function ownedAwayOwnFirsts(
  teamId: string,
  ownership: Record<string, OwnedPick[]> | null,
): number[] {
  if (!ownership) return [];
  const years = new Set<number>();
  for (const picks of Object.values(ownership)) {
    for (const p of picks) {
      if (
        p.round === 1 &&
        p.original_team_id === teamId &&
        p.current_owner_team_id !== teamId &&
        p.asset_class === 'pick' &&
        p.year >= CURRENT_YEAR
      ) {
        years.add(p.year);
      }
    }
  }
  return [...years];
}

// ── Comparables profile prep ───────────────────────────────────────

export function buildProposedProfile(
  left: BuilderState,
  right: BuilderState,
  salaryCap: number | null,
): TradeProfile | null {
  if (!left.teamId || !right.teamId) return null;
  if (left.teamId === right.teamId) return null;
  const leftSide = toSide(left, salaryCap);
  const rightSide = toSide(right, salaryCap);
  if (!leftSide || !rightSide) return null;
  if (leftSide.players.length + leftSide.pickCount === 0) return null;
  if (rightSide.players.length + rightSide.pickCount === 0) return null;
  return {
    id: `proposed-${Date.now()}`,
    year: CURRENT_YEAR,
    sides: [leftSide, rightSide],
    // motivation undefined on purpose — user-built trades aren't hand-tagged
  };
}

export function toSide(state: BuilderState, salaryCap: number | null): TeamSide | null {
  if (!state.teamId) return null;
  const outgoing = outgoingPlayersOf(state);
  const players: PlayerProfile[] = outgoing.map((p) => ({
    name: p.player_name,
    age: p.age ?? 0,
    bpm: p.bpm,
    contractYearsRemaining: p.contractYearsRemaining,
    capPct: p.salary != null && salaryCap ? p.salary / salaryCap : null,
  }));
  return {
    teamId: state.teamId,
    players,
    pickCount: state.picks.length,
  };
}
