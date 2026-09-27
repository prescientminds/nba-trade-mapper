// ── Hypothetical trade: durable intent ↔ working builder state ─────
//
// `HypotheticalSide[]` is the durable, JSON-safe intent (what the canvas
// card, share links, and the URL carry). `BuilderState[]` is the builder's
// working state (roster fetched, selections as Sets/Maps). These helpers
// convert between the two, encode intent into a compact URL param, and
// derive the display pieces shared by the canvas card and the builder page.

import {
  liftHypotheticalSide,
  type HypotheticalSide,
} from './graph-store';
import { getAnyTeamDisplayInfo } from './teams';
import {
  emptyState,
  evaluateLegalityForSlots,
  type BuilderState,
  type LegalityVerdict,
  type OutgoingPick,
  type OwnedPick,
} from './trade-builder';

export const SLOT_LABELS = ['Team A', 'Team B', 'Team C', 'Team D'];

export function teamShortName(teamId: string): string {
  return getAnyTeamDisplayInfo(teamId)?.name.split(' ').pop() || teamId;
}

export function hydrateSide(side: HypotheticalSide | undefined): BuilderState {
  if (!side) return emptyState(null);
  // Lift defends against legacy serialized shares with `playerNames: string[]`.
  const lifted = liftHypotheticalSide(side);
  return {
    teamId: lifted.teamId,
    roster: [],
    selectedPlayerNames: new Set(lifted.playerNames.map((p) => p.name)),
    picks: lifted.picks.map(({ toTeamId: _t, ...pick }) => pick),
    playerDestinations: new Map(lifted.playerNames.map((p) => [p.name, p.toTeamId])),
    pickDestinations: new Map(lifted.picks.map((p) => [p.pick_key, p.toTeamId])),
  };
}

/**
 * Persist a BuilderState back into the durable HypotheticalSide shape.
 * In 2-team mode the destination is unambiguous — fill `toTeamId` with the
 * other side's team id. In 3+/4-team mode the user's explicit choice is kept.
 */
export function toSide(state: BuilderState, allTeamIds: Array<string | null>, selfIdx: number): HypotheticalSide {
  const filledOthers = allTeamIds.filter((t, i): t is string => i !== selfIdx && !!t);
  const defaultDest = allTeamIds.length === 2 ? filledOthers[0] ?? null : null;
  return {
    teamId: state.teamId,
    playerNames: [...state.selectedPlayerNames].map((name) => ({
      name,
      toTeamId: state.playerDestinations.get(name) ?? defaultDest,
    })),
    picks: state.picks.map((p) => ({
      ...p,
      toTeamId: state.pickDestinations.get(p.pick_key) ?? defaultDest,
    })),
  };
}

export function slotsToSides(slots: BuilderState[]): HypotheticalSide[] {
  const ids = slots.map((s) => s.teamId);
  return slots.map((s, i) => toSide(s, ids, i));
}

// ── Ledger: what each team receives ────────────────────────────────

export interface LedgerRow {
  teamId: string;
  teamName: string;
  players: string[];
  picks: OutgoingPick[];
}

/**
 * Per-team incoming assets. 2-team trades treat an unrouted asset as going
 * to the other side; with 3+ teams only explicitly routed assets count.
 */
export function computeLedgerRows(sides: HypotheticalSide[] | undefined): LedgerRow[] {
  const safe = (sides ?? []).map((s) => liftHypotheticalSide(s));
  const isTwoTeam = safe.filter((s) => !!s.teamId).length === 2;
  const rows: LedgerRow[] = [];
  safe.forEach((side, idx) => {
    if (!side.teamId) return;
    const players: string[] = [];
    const picks: OutgoingPick[] = [];
    safe.forEach((other, otherIdx) => {
      if (otherIdx === idx) return;
      for (const p of other.playerNames) {
        if (p.toTeamId === side.teamId || (isTwoTeam && p.toTeamId == null)) players.push(p.name);
      }
      for (const pk of other.picks) {
        if (pk.toTeamId === side.teamId || (isTwoTeam && pk.toTeamId == null)) picks.push(pk);
      }
    });
    rows.push({ teamId: side.teamId, teamName: teamShortName(side.teamId), players, picks });
  });
  return rows;
}

export function pickLabel(pick: Pick<OutgoingPick, 'year' | 'original_team_id' | 'round' | 'asset_class' | 'conditional'>): string {
  const roundLabel = pick.round === 1 ? '1st' : '2nd';
  const tag = pick.asset_class === 'swap' ? ' (swap)' : pick.conditional ? ' (cond.)' : '';
  return `${pick.year} ${pick.original_team_id} ${roundLabel}${tag}`;
}

// ── Verdict with team names ────────────────────────────────────────

/**
 * The builder's verdict with "Team A/B" resolved to team names, for surfaces
 * that don't label columns A/B (the canvas card, the share image, the page).
 */
export function displayVerdict(
  slots: BuilderState[],
  ownership: Record<string, OwnedPick[]> | null,
): LegalityVerdict {
  const v = evaluateLegalityForSlots(slots, ownership);
  const reason = slots.reduce((r, slot, i) => {
    if (!slot.teamId) return r;
    const name = teamShortName(slot.teamId);
    return r.replaceAll(`${SLOT_LABELS[i]} sends`, `${name} send`).replaceAll(SLOT_LABELS[i], name);
  }, v.reason);
  return { status: v.status, reason };
}

// ── URL encoding ───────────────────────────────────────────────────
//
// Compact form: teams + player names + pick keys (+ destinations). Picks are
// re-resolved against the ownership table on load, so the URL stays short.

interface CompactSide {
  t: string | null;
  p: Array<[string, string | null]>;
  k: Array<[string, string | null]>;
}

export interface DecodedSide {
  teamId: string | null;
  players: Array<{ name: string; toTeamId: string | null }>;
  picks: Array<{ pickKey: string; toTeamId: string | null }>;
}

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeSides(sides: HypotheticalSide[]): string {
  const compact: CompactSide[] = sides.map((s) => ({
    t: s.teamId,
    p: s.playerNames.map((p) => [p.name, p.toTeamId]),
    k: s.picks.map((p) => [p.pick_key, p.toTeamId]),
  }));
  return b64urlEncode(JSON.stringify(compact));
}

export function decodeSides(param: string | null): DecodedSide[] | null {
  if (!param) return null;
  try {
    const compact = JSON.parse(b64urlDecode(param)) as CompactSide[];
    if (!Array.isArray(compact)) return null;
    return compact.slice(0, 4).map((c) => ({
      teamId: typeof c.t === 'string' ? c.t : null,
      players: (c.p ?? []).map(([name, to]) => ({ name, toTeamId: to ?? null })),
      picks: (c.k ?? []).map(([pickKey, to]) => ({ pickKey, toTeamId: to ?? null })),
    }));
  } catch {
    return null;
  }
}

/** Resolve decoded pick keys against the ownership table into full sides. */
export function resolveDecoded(
  decoded: DecodedSide[],
  ownership: Record<string, OwnedPick[]>,
): HypotheticalSide[] {
  return decoded.map((d) => {
    const owned = d.teamId ? ownership[d.teamId] ?? [] : [];
    const byKey = new Map(owned.map((o) => [o.pick_key, o]));
    return {
      teamId: d.teamId,
      playerNames: d.players,
      picks: d.picks.flatMap(({ pickKey, toTeamId }) => {
        const o = byKey.get(pickKey);
        if (!o) return [];
        return [{
          pick_key: o.pick_key,
          year: o.year,
          round: o.round,
          original_team_id: o.original_team_id,
          asset_class: o.asset_class,
          conditional: o.conditional,
          lineage: o.lineage,
          toTeamId,
        }];
      }),
    };
  });
}
