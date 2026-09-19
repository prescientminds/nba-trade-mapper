/**
 * Player value model for the comparables engine.
 *
 * Two different numbers, deliberately kept apart:
 *
 *   talent(p)     — on-court value only. What the player is, ignoring the deal.
 *   assetValue(p) — talent adjusted for what he costs and how long you keep him.
 *                   This is the "tradeable contract" quantity: a good player on
 *                   a cheap long deal is a bigger asset than the same player on
 *                   an expiring max.
 *
 * Similarity needs both. Collapsing them loses the distinction between "star on
 * a rookie deal" and "star on a supermax", which is most of what separates a
 * teardown from a star acquisition.
 *
 * The age curve and the cap-denominator shape are lifted from the existing
 * CATV analysis (`scripts/analyze-catv.ts:63-70`) so the two agree. That script
 * uses win shares; here the production term is BPM, which is what the trade
 * profiles carry.
 */

import type { PlayerProfile, TeamSide } from './types';

/**
 * BPM at replacement level. Basketball-Reference defines replacement as -2.0
 * BPM; a player at or below it contributes nothing you couldn't get for the
 * minimum, so his talent floor is 0 rather than a negative number that would
 * perversely subtract from his side's package.
 */
export const REPLACEMENT_BPM = -2.0;

/**
 * Production when BPM is missing. Treated as replacement level rather than
 * league average: a row with no BPM is overwhelmingly a low-minutes player, and
 * v1's choice of 0 (league average) quietly promoted every such player to
 * starter-grade talent.
 */
export const MISSING_BPM_PRODUCTION = 0;

/**
 * Production above replacement, with no age adjustment.
 *
 * `talent` is the right number for "how much value is moving"; this is the
 * right number for "who is the headline of this trade". Age-adjusting the
 * latter hides veterans: a 35-year-old Paul Pierce falls to 2.5 talent and
 * stops looking like the centrepiece of his own trade.
 */
export function rawProduction(p: PlayerProfile): number {
  if (p.bpm == null) return MISSING_BPM_PRODUCTION;
  return Math.max(0, p.bpm - REPLACEMENT_BPM);
}

/** Age multiplier. Same brackets as `scripts/analyze-catv.ts:63-70`. */
export function ageMultiplier(age: number): number {
  if (age <= 23) return 1.15;
  if (age <= 27) return 1.0;
  if (age <= 30) return 0.85;
  if (age <= 33) return 0.65;
  return 0.45;
}

/** Age bracket used by the structural gate. */
export type AgeBracket = 'young' | 'prime' | 'veteran' | 'old';

export function ageBracket(age: number): AgeBracket {
  if (age <= 23) return 'young';
  if (age <= 27) return 'prime';
  if (age <= 30) return 'veteran';
  return 'old';
}

/**
 * On-court value, floored at 0 and scaled so a league-average starter sits near
 * 2 and a genuine superstar near 10-14.
 */
export function talent(p: PlayerProfile): number {
  if (p.bpm == null) return MISSING_BPM_PRODUCTION;
  const production = Math.max(0, p.bpm - REPLACEMENT_BPM);
  return production * ageMultiplier(p.age);
}

/**
 * Talent adjusted for contract. Cheap and long multiplies up; expensive and
 * expiring multiplies down.
 *
 * The cap denominator is floored at 5% (the CATV convention) so a minimum
 * contract doesn't divide by a near-zero and produce an unbounded asset value.
 * The horizon term is `1 + years` rather than `years` so an expiring deal keeps
 * the player's talent rather than zeroing it — an expiring star is still worth
 * something, which is the whole premise of a rental.
 *
 * When salary or contract length is unknown — true for ~16% of player rows,
 * overwhelmingly pre-1990 — this falls back to plain talent rather than
 * inventing a contract. Every consumer treats the two as the same scale.
 */
export function assetValue(p: PlayerProfile): number {
  const base = talent(p);
  if (base === 0) return 0;
  if (p.capPct == null || p.contractYearsRemaining == null) return base;
  const costRatio = 0.15 / Math.max(p.capPct, 0.05);
  const horizon = 1 + Math.min(p.contractYearsRemaining, 5) * 0.25;
  return base * costRatio * horizon;
}

/** Highest-talent player on a side. Ties break on cap %. Null if no players. */
export function headlinePlayer(players: PlayerProfile[]): PlayerProfile | null {
  if (players.length === 0) return null;
  let best = players[0];
  let bestTalent = talent(best);
  for (const p of players.slice(1)) {
    const t = talent(p);
    if (t > bestTalent || (t === bestTalent && (p.capPct ?? 0) > (best.capPct ?? 0))) {
      best = p;
      bestTalent = t;
    }
  }
  return best;
}

/**
 * Star tier of a single player, used by the structural gate. Thresholds are on
 * the `talent` scale: a +6 BPM 27-year-old lands at 8.0, a +2 BPM at 4.0.
 */
export type StarTier = 'superstar' | 'star' | 'starter' | 'rotation' | 'filler';

export function starTier(t: number): StarTier {
  if (t >= 9) return 'superstar';
  if (t >= 6.5) return 'star';
  if (t >= 4) return 'starter';
  if (t >= 2) return 'rotation';
  return 'filler';
}

export const STAR_TIER_ORDER: StarTier[] = ['filler', 'rotation', 'starter', 'star', 'superstar'];

/** Distance in tiers, so the gate can allow "within one bracket". */
export function tierDistance(a: StarTier, b: StarTier): number {
  return Math.abs(STAR_TIER_ORDER.indexOf(a) - STAR_TIER_ORDER.indexOf(b));
}

/**
 * Draft capital sent by a side, in units roughly comparable to `assetValue`.
 *
 * A first is worth appreciably more than a second, and a swap right is worth a
 * fraction of an outright pick. These weights intentionally mirror
 * `src/app/assets/scorers.ts:47-71` (1st = 10, 2nd = 2, swap x0.4) so the Asset
 * Dashboard and the comparables engine do not disagree about what a pick is
 * worth. Both are crude — there is no slot curve or lottery-odds conditioning
 * anywhere in the codebase yet.
 */
export const FIRST_ROUND_VALUE = 10;
export const SECOND_ROUND_VALUE = 2;
export const SWAP_DISCOUNT = 0.4;

export function pickValue(side: TeamSide): number {
  const firsts = side.firstRoundPicks;
  const seconds = side.secondRoundPicks;
  if (firsts == null || seconds == null) {
    // Pre-v2 profile: only a total. Assume the corpus-wide first/second mix
    // rather than silently treating every pick as a first.
    return side.pickCount * ((FIRST_ROUND_VALUE + SECOND_ROUND_VALUE) / 2);
  }
  const swaps = side.swapCount ?? 0;
  return (
    firsts * FIRST_ROUND_VALUE +
    seconds * SECOND_ROUND_VALUE +
    swaps * FIRST_ROUND_VALUE * SWAP_DISCOUNT
  );
}

/** Total picks including swaps, whichever shape the profile is in. */
export function totalPicks(side: TeamSide): number {
  if (side.firstRoundPicks == null || side.secondRoundPicks == null) return side.pickCount;
  return side.firstRoundPicks + side.secondRoundPicks + (side.swapCount ?? 0);
}
