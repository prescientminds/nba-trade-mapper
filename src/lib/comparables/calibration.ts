/**
 * Turning a distance into a number a person can read.
 *
 * v1 min-max normalized within the five returned cards, so the top card was
 * always "100% match" and the fifth always "0%" no matter how good or bad the
 * fit actually was. A proposal with five near-identical precedents and one with
 * nothing like it in the corpus displayed the same five numbers. Querying the
 * Kawhi Leonard trade returned the Kawhi Leonard trade itself at "11% match".
 *
 * The fix is an absolute scale, calibrated once against the corpus:
 * `matchScore = 1 - CDF(distance)`. Five weak comparables all score low, and
 * the top card is not automatically 1.0.
 *
 * The reference distribution is deliberately NOT random trade pairs. Against
 * random pairs every nearest neighbour scores 96-100%, because the closest of
 * 1,570 candidates is by construction in the extreme tail — measured, and it
 * saturated exactly that way. The reference is instead the distribution of
 * nearest-neighbour distances across the corpus: each trade's own top five,
 * pooled. A score of 0.5 means "as good a comp as the median trade gets"; 0.9
 * means a genuinely close precedent; 0.2 means there isn't one.
 *
 * The artifact is written by `scripts/build-comparables-calibration.ts` and
 * carries a signature over the feature names and weights. If the distance
 * function changes without the calibration being rebuilt, the scale it maps
 * through is silently wrong, so the signature mismatch throws in development.
 */

import type { MatchBand } from './types';
import type { FeatureStats, StarTier } from './distance';

export interface CalibrationArtifact {
  /** Schema version of this file's own format. */
  version: number;
  /** Hash over feature names + weights. Must match the running code. */
  signature: string;
  /** When it was built, and against how many trades and sampled pairs. */
  generatedAt: string;
  tradeCount: number;
  pairCount: number;
  /** Per-feature mean and standard deviation, for z-scoring. */
  stats: FeatureStats;
  /**
   * Distance at each percentile of the pooled nearest-neighbour distribution,
   * index 0 = 0th percentile through index 100 = 100th. Non-decreasing.
   * Used as the fallback when a tier has too little data of its own.
   */
  quantiles: number[];
  /**
   * The same curve computed separately for each star tier, plus how many
   * neighbours went into each.
   *
   * Stratification matters because trade types are not equally common. A
   * superstar trade's closest comp is far away in absolute terms simply
   * because superstar trades are rare, while a routine depth swap has dozens
   * of near-duplicates. Scored against one pooled curve, every blockbuster
   * came out at 3-8% — "no real precedent" while sitting next to Barkley to
   * Phoenix and Chris Paul to the Clippers. Comparing like with like fixes it:
   * a superstar trade is scored against the comps other superstar trades get.
   */
  byTier: Record<string, { quantiles: number[]; sampleCount: number }>;
}

/**
 * Below this many neighbours a stratum's own curve is too noisy to trust and
 * the pooled curve is used instead.
 */
export const MIN_TIER_SAMPLES = 200;

/**
 * Calibration strata. Not one per star tier, because the top of the corpus is
 * thin: across 1,570 trades there are only 18 superstar-tier and 35 star-tier
 * ones, giving 90 and 175 neighbours. Both fall under the reliability floor on
 * their own and would silently drop back to the pooled curve, which is the very
 * thing stratification exists to avoid. Merged, `elite` has 265 and stands up.
 */
export function calibrationStratum(tier: StarTier): string {
  return tier === 'star' || tier === 'superstar' ? 'elite' : tier;
}

/**
 * Band thresholds on the absolute score.
 *
 * These exist because a bare percentage invites over-reading. "87%" sounds
 * precise; "strong precedent" says what it means. Copy should lead with the
 * band and offer the number as detail.
 */
export const BAND_THRESHOLDS: ReadonlyArray<{ min: number; band: MatchBand }> = [
  { min: 0.9, band: 'near-identical' },
  { min: 0.7, band: 'strong' },
  { min: 0.45, band: 'loose' },
  { min: 0, band: 'weak' },
];

export function bandFor(score: number): MatchBand {
  for (const t of BAND_THRESHOLDS) if (score >= t.min) return t.band;
  return 'weak';
}

export const BAND_LABELS: Readonly<Record<MatchBand, string>> = {
  'near-identical': 'Near-identical precedent',
  strong: 'Strong precedent',
  loose: 'Loose precedent',
  weak: 'No real precedent',
};

/**
 * Fraction of sampled historical pairs that are closer than `distance`.
 * Linear interpolation between the stored percentile breakpoints.
 */
export function empiricalCdf(distance: number, quantiles: number[]): number {
  if (quantiles.length === 0) return 0;
  if (distance <= quantiles[0]) return 0;
  const last = quantiles.length - 1;
  if (distance >= quantiles[last]) return 1;

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (quantiles[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const span = quantiles[hi] - quantiles[lo];
  const frac = span > 0 ? (distance - quantiles[lo]) / span : 0;
  return (lo + frac) / last;
}

/** Absolute similarity in 0..1. 1 = closer than everything in the corpus. */
export function matchScoreFor(distance: number, quantiles: number[]): number {
  return 1 - empiricalCdf(distance, quantiles);
}

/**
 * The percentile curve to score against, given the proposal's star tier.
 * Falls back to the pooled curve when that tier is too sparse to be reliable.
 */
export function quantilesForTier(
  calibration: Pick<CalibrationArtifact, 'quantiles' | 'byTier'>,
  tier: StarTier,
): number[] {
  const entry = calibration.byTier?.[calibrationStratum(tier)];
  if (entry && entry.sampleCount >= MIN_TIER_SAMPLES && entry.quantiles.length) {
    return entry.quantiles;
  }
  return calibration.quantiles;
}

/**
 * Stable signature over what the distance function actually computes. Any
 * change to the feature list, their order, or their weights changes this, and
 * a stale calibration then fails loudly instead of quietly mis-scaling.
 */
export function calibrationSignature(
  featureNames: readonly string[],
  weights: readonly number[],
): string {
  const payload = featureNames.map((n, i) => `${n}:${weights[i]}`).join('|');
  // Small, dependency-free, and sufficient to detect drift. This guards against
  // mistakes, not tampering.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
