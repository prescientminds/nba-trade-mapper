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
// Current season only. Phase B v1: 2- or 3-team trades supported in the
// canvas-native side panel (standalone /trade-machine page is 2-team-only,
// retiring with Phase B). Historical seasons in v2.

/** Hard cap on teams per hypothetical trade. 4 is the real-NBA ceiling — 5-team
 *  trades exist but are rare and the UX collapses past 4. */
export const MAX_TEAMS_PER_TRADE = 4;

/** Minimum minutes played for a player's BPM to be treated as meaningful.
 *  BPM is a per-100-possession rate stat — on a tiny sample it's noise (a
 *  garbage-time rookie can post +11 on a handful of minutes). Below this floor
 *  the BPM is nulled at roster-fetch time, so it neither sorts to the top of a
 *  roster nor feeds the comparables matcher with a misleading figure.
 *
 *  Note: the Asset Dashboard's `TALENT_MIN_MP = 500` is a different threshold
 *  for a different question — "does this player qualify as a real rotation
 *  contributor for the young-talent tier?" — and stays separate by design. */
export const BPM_MIN_MINUTES = 150;

// ── Types ──────────────────────────────────────────────────────────

export interface RosterPlayer {
  player_name: string;
  age: number | null;
  /** Box Plus/Minus. Null when minutes are below BPM_MIN_MINUTES (small-sample
   *  noise) or when the source row has no BPM at all. */
  bpm: number | null;
  /** Total minutes played this season. Used to gate `bpm`; lets the display
   *  tell a sub-floor "—" apart from genuinely missing data. */
  minutesPlayed: number | null;
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
  /** Per-asset destination routing. Key = player name; value = recipient team id.
   *  For 2-team trades the panel auto-fills with the other side at persist time.
   *  For N>=3 the user picks via the per-asset dropdown; default on select is the
   *  first non-self team. `null` means unrouted. */
  playerDestinations: Map<string, string | null>;
  /** Per-pick destination routing. Key = pick_key. Same defaulting as players. */
  pickDestinations: Map<string, string | null>;
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
    playerDestinations: new Map(),
    pickDestinations: new Map(),
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

/**
 * N-slot legality. Drives both the 2-team and 3-team UIs through one
 * code path. The 2-team adapter below preserves the original signature
 * for the standalone `/trade-machine` page.
 *
 * 3-team CBA matching note: per-asset routing isn't modeled yet (each
 * `HypotheticalSide` knows what it sends but not which other team
 * receives each asset). For 3-team trades we fire Stepien and 7-year
 * cap per team — those depend only on what each team sends — and skip
 * the dollar-matching check with an explicit banner reason. Routing
 * support is a follow-up.
 */
export function evaluateLegalityForSlots(
  slots: BuilderState[],
  ownership: Record<string, OwnedPick[]> | null,
): LegalityVerdict {
  const filled = slots.filter((s) => !!s.teamId);
  if (filled.length < 2) {
    return { status: 'incomplete', reason: 'Pick a team on each side' };
  }
  if (filled.length < slots.length) {
    return { status: 'incomplete', reason: 'Pick a team on each side' };
  }

  const teamIds = filled.map((s) => s.teamId as string);
  const uniqueTeamIds = new Set(teamIds);
  if (uniqueTeamIds.size !== teamIds.length) {
    return { status: 'illegal', reason: 'Two sides are the same team' };
  }

  for (const s of filled) {
    const assetCount = s.selectedPlayerNames.size + s.picks.length;
    if (assetCount === 0) {
      return { status: 'incomplete', reason: 'Each side must send at least one asset' };
    }
  }

  // Pick rules — Stepien + 7-year cap. Routing-independent: only depend
  // on what each team sends. Fires for any N.
  const pickRuleResult = checkPickRulesForSlots(filled, ownership);
  if (!pickRuleResult.legal) {
    return { status: 'illegal', reason: pickRuleResult.violations[0].reason };
  }

  // CBA dollar matching — 2-team only until per-asset routing lands.
  if (filled.length === 2) {
    const [left, right] = filled;
    const { total: leftSalary, complete: leftComplete } = outgoingSalaryOf(left);
    const { total: rightSalary, complete: rightComplete } = outgoingSalaryOf(right);
    const bothHaveSalary =
      leftComplete && rightComplete &&
      left.selectedPlayerNames.size > 0 && right.selectedPlayerNames.size > 0;

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

  // 3+ teams: pick rules cleared. CBA salary matching deferred.
  return {
    status: 'legal',
    reason: 'Pick rules clear for all teams · 3-team salary matching requires per-asset routing (v2)',
  };
}

/** 2-team adapter, preserved for the standalone /trade-machine page. */
export function evaluateLegality(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
): LegalityVerdict {
  return evaluateLegalityForSlots([left, right], ownership);
}

/**
 * Stepien + 7-year cap for N slots. Each slot fires its own context;
 * `validatePickRules` aggregates violations across teams.
 */
export function checkPickRulesForSlots(
  slots: BuilderState[],
  ownership: Record<string, OwnedPick[]> | null,
) {
  const filled = slots.filter((s) => !!s.teamId);
  if (filled.length < 2) {
    return { legal: true, violations: [] as { reason: string }[] };
  }

  const outgoingByTeam: Record<string, PickAsset[]> = {};
  const teamContexts: Record<string, TeamPickContext> = {};
  for (const s of filled) {
    const teamId = s.teamId as string;
    outgoingByTeam[teamId] = s.picks.map((p) => ({
      pick_key: p.pick_key,
      year: p.year,
      round: p.round,
      original_team_id: p.original_team_id,
      asset_class: p.asset_class,
    }));
    teamContexts[teamId] = {
      teamId,
      ownFirstsAlreadyOwed: ownedAwayOwnFirsts(teamId, ownership),
    };
  }

  return validatePickRules(outgoingByTeam, teamContexts, CURRENT_YEAR);
}

/** 2-team adapter, preserved for the standalone /trade-machine page. */
export function checkPickRules(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
) {
  return checkPickRulesForSlots([left, right], ownership);
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

/**
 * N-slot proposed profile. Greedy anchor matcher in comparables.ts works on
 * any number of sides — strongest anchors get paired across the proposed and
 * candidate trades regardless of count, so 3-team trades will surface the
 * best 2-anchor matches against the (overwhelmingly 2-team) historical set.
 */
export function buildProposedProfileForSlots(
  slots: BuilderState[],
  salaryCap: number | null,
): TradeProfile | null {
  const filled = slots.filter((s) => !!s.teamId);
  if (filled.length < 2) return null;
  const teamIds = filled.map((s) => s.teamId as string);
  if (new Set(teamIds).size !== teamIds.length) return null;
  const sides: TeamSide[] = [];
  for (const s of filled) {
    const side = toSide(s, salaryCap);
    if (!side) return null;
    if (side.players.length + side.pickCount === 0) return null;
    sides.push(side);
  }
  return {
    id: `proposed-${Date.now()}`,
    year: CURRENT_YEAR,
    sides,
    // motivation undefined on purpose — user-built trades aren't hand-tagged
  };
}

/** 2-team adapter, preserved for the standalone /trade-machine page. */
export function buildProposedProfile(
  left: BuilderState,
  right: BuilderState,
  salaryCap: number | null,
): TradeProfile | null {
  return buildProposedProfileForSlots([left, right], salaryCap);
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
