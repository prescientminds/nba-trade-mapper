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

export interface AnchorSummary {
  name: string;
  age: number;
  bpm: number | null;
}

/** Deltas between the tightest proposed→candidate anchor pairing. */
export interface MatchFactors {
  proposedAnchor: AnchorSummary;
  candidateAnchor: AnchorSummary;
  /** proposed.bpm − candidate.bpm (null if either side has no BPM). */
  bpmDelta: number | null;
  /** proposed.age − candidate.age. */
  ageDelta: number;
  /** proposed.year − candidate.year (positive = proposed is newer). */
  eraGap: number;
}

export interface Comparable {
  id: string;
  /** 0..1 within the returned set. 1 = closest, 0 = furthest among top N. */
  matchScore: number;
  motivation?: MotivationFlag;
  headline?: string;
  outcomeSummary?: string;
  /** Year of the candidate trade — passed through so the UI doesn't have to look it up. */
  year?: number;
  /** Tightest anchor pairing, used for UI chips + expanded rationale. */
  factors?: MatchFactors;
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

function toAnchorSummary(p: PlayerProfile): AnchorSummary {
  return { name: p.name, age: p.age, bpm: p.bpm };
}

/**
 * Pair proposed anchors → candidate anchors greedily, return the mean anchor
 * distance (with era penalty) plus the tightest pairing for UI display.
 */
export function tradeMatch(
  proposed: TradeProfile,
  candidate: TradeProfile,
): { distance: number; factors: MatchFactors | null } {
  const pAnchors = proposed.sides
    .map((s) => anchorPlayer(s.players))
    .filter((p): p is PlayerProfile => p !== null);
  const cAnchors = candidate.sides
    .map((s) => anchorPlayer(s.players))
    .filter((p): p is PlayerProfile => p !== null);

  if (pAnchors.length === 0 || cAnchors.length === 0) {
    return { distance: Infinity, factors: null };
  }

  const used = new Set<number>();
  let total = 0;
  let matched = 0;
  let tightest: { p: PlayerProfile; c: PlayerProfile; d: number } | null = null;

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
    if (!tightest || bestDist < tightest.d) {
      tightest = { p, c: cAnchors[bestIdx], d: bestDist };
    }
  }
  if (matched === 0 || !tightest) return { distance: Infinity, factors: null };

  const mean = total / matched;
  const eraPenalty = 1 + Math.abs(proposed.year - candidate.year) / 30;

  const bpmDelta =
    tightest.p.bpm != null && tightest.c.bpm != null
      ? tightest.p.bpm - tightest.c.bpm
      : null;

  const factors: MatchFactors = {
    proposedAnchor: toAnchorSummary(tightest.p),
    candidateAnchor: toAnchorSummary(tightest.c),
    bpmDelta,
    ageDelta: tightest.p.age - tightest.c.age,
    eraGap: proposed.year - candidate.year,
  };

  return { distance: mean * eraPenalty, factors };
}

/** Mean anchor-pair distance between two trades, with era penalty. */
export function tradeDistance(
  proposed: TradeProfile,
  candidate: TradeProfile,
): number {
  return tradeMatch(proposed, candidate).distance;
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
    .map((c) => {
      const { distance, factors } = tradeMatch(proposed, c);
      return { trade: c, distance, factors };
    })
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
    year: s.trade.year,
    factors: s.factors ?? undefined,
  }));
}
