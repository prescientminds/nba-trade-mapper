/**
 * Trade Machine comparables engine.
 *
 * Transparent nearest-neighbor matcher on (BPM, age), with era as a soft penalty.
 *   - No structural gate, no motivation gate, no package bucketing.
 *   - The anchor player on each side is the highest-BPM player.
 *   - Distance between two trades is the average pair-distance between anchors,
 *     greedily matched proposed → candidate.
 *   - Era penalty multiplies the distance by (1 + |yearDelta| / 30).
 *
 * Motivation tags (hand or auto) pass through on the TradeProfile as display
 * metadata. They do not affect ranking.
 *
 * This lib is pure — no Supabase calls. The caller resolves candidate
 * TradeProfiles once (via /data/trade-profiles.json) and passes them in.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Retained for display metadata only; no longer influences ranking. */
export type MotivationFlag =
  | 'star_acquisition'
  | 'forced_exit'
  | 'teardown'
  | 'salary_dump'
  | 'rental'
  | 'reshuffle'
  | 'unclear';

export interface PlayerProfile {
  name: string;
  age: number;
  /** Basketball-Reference BPM at the moment of trade. Pass through as stored;
   *  no small-sample fallback — BPM is here to react fast. */
  bpm: number | null;
  /** Contract years remaining after the trade (0 = expiring). Retained on the
   *  profile for UI/future use; not part of the current distance function. */
  contractYearsRemaining: number | null;
  /** Salary as a percentage of that season's salary cap. Same note as above. */
  capPct: number | null;
}

export interface TeamSide {
  teamId: string;
  players: PlayerProfile[];
  pickCount: number;
}

export interface TradeProfile {
  id: string;
  /** End-year of the trade season, e.g. 2018 for the 2017-18 season. */
  year: number;
  sides: TeamSide[];
  motivation?: MotivationFlag;
  motivationSource?: 'hand' | 'auto';
  outcomeSummary?: string;
  headline?: string;
}

export interface Comparable {
  id: string;
  /** 0..1 within the returned set. 1 = closest, 0 = furthest among top N. */
  matchScore: number;
  motivation?: MotivationFlag;
  headline?: string;
  outcomeSummary?: string;
}

// ── Anchors ──────────────────────────────────────────────────────────

/** Highest-BPM player on a side; ties broken by cap %. Null if no players. */
export function anchorPlayer(players: PlayerProfile[]): PlayerProfile | null {
  if (players.length === 0) return null;
  let best = players[0];
  for (const p of players.slice(1)) {
    const a = p.bpm ?? -Infinity;
    const b = best.bpm ?? -Infinity;
    if (a > b) { best = p; continue; }
    if (a === b && (p.capPct ?? 0) > (best.capPct ?? 0)) best = p;
  }
  return best;
}

// ── Distance ─────────────────────────────────────────────────────────

const WEIGHT_BPM = 1.0;
const WEIGHT_AGE = 0.7;
/** BPM is stored as null for some old rows. Treat as league average (0)
 *  rather than dropping the comparison; the matcher still ranks on age. */
const BPM_NULL_FALLBACK = 0;

function anchorDistance(a: PlayerProfile, b: PlayerProfile): number {
  const aBpm = a.bpm ?? BPM_NULL_FALLBACK;
  const bBpm = b.bpm ?? BPM_NULL_FALLBACK;
  const dBpm = aBpm - bBpm;
  const dAge = a.age - b.age;
  return Math.sqrt(WEIGHT_BPM * dBpm * dBpm + WEIGHT_AGE * dAge * dAge);
}

/** Mean anchor-pair distance between two trades, with era penalty. */
export function tradeDistance(
  proposed: TradeProfile,
  candidate: TradeProfile,
): number {
  const pAnchors = proposed.sides
    .map((s) => anchorPlayer(s.players))
    .filter((p): p is PlayerProfile => p !== null);
  const cAnchors = candidate.sides
    .map((s) => anchorPlayer(s.players))
    .filter((p): p is PlayerProfile => p !== null);

  if (pAnchors.length === 0 || cAnchors.length === 0) return Infinity;

  const used = new Set<number>();
  let total = 0;
  let matched = 0;
  for (const p of pAnchors) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < cAnchors.length; i++) {
      if (used.has(i)) continue;
      const d = anchorDistance(p, cAnchors[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    used.add(bestIdx);
    total += bestDist;
    matched += 1;
  }
  if (matched === 0) return Infinity;

  const mean = total / matched;
  const eraPenalty = 1 + Math.abs(proposed.year - candidate.year) / 30;
  return mean * eraPenalty;
}

// ── Main ─────────────────────────────────────────────────────────────

export interface FindComparablesOptions {
  topN?: number;
}

/**
 * Rank historical candidates against a proposed trade.
 * Returns at most `topN` comparables, sorted by ascending distance (best first).
 * `matchScore` is normalized 0..1 within the returned set.
 */
export function findComparables(
  proposed: TradeProfile,
  candidates: TradeProfile[],
  opts: FindComparablesOptions = {},
): Comparable[] {
  const topN = opts.topN ?? 5;

  const scored = candidates
    .filter((c) => c.id !== proposed.id)
    .map((c) => ({ trade: c, distance: tradeDistance(proposed, c) }))
    .filter((s) => Number.isFinite(s.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);

  if (scored.length === 0) return [];
  const best = scored[0].distance;
  const worst = scored[scored.length - 1].distance;
  const span = worst - best || 1;

  return scored.map((s) => ({
    id: s.trade.id,
    matchScore: 1 - (s.distance - best) / span,
    motivation: s.trade.motivation,
    headline: s.trade.headline,
    outcomeSummary: s.trade.outcomeSummary,
  }));
}
