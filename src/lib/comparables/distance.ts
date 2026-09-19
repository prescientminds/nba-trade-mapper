/**
 * Structural gate + standardized weighted distance.
 *
 * ## Why standardization is the whole ballgame
 *
 * v1 summed raw BPM and raw age into one Euclidean distance. Those are
 * different units with different spreads, so the weights (1.0 and 0.7) did not
 * mean what they looked like they meant — age, which ranges over ~20 years,
 * silently dominated BPM, which ranges over ~15 points but clusters in 4.
 *
 * Every feature here is z-scored against the corpus before weighting, using
 * means and standard deviations baked into the calibration artifact. After
 * that a weight of 1.0 genuinely means "one standard deviation of this feature
 * counts as much as one standard deviation of that one".
 *
 * ## Why the gate does not use archetype
 *
 * The design doc's Stage 1 called for filtering to the same archetype. Measured
 * against the 100 recovered hand tags, the deriver scores 70.4% where always
 * answering "reshuffle" scores 73.2% — and the label set has just 19
 * non-reshuffle examples spread across four classes, two of which have n<=3.
 * There is no basis there for a hard filter, so the gate uses only quantities
 * computed straight from the data, and archetype contributes a modest weighted
 * term instead. See `scripts/validate-archetypes.ts`.
 */

import type { TradeProfile, MotivationFlag } from './types';
import { extractFeatures, toVector, FEATURE_NAMES, type TradeFeatures } from './features';
import { starTier, tierDistance, type StarTier } from './value';

export type { StarTier };
import { deriveArchetype } from './archetype';

/**
 * Per-feature weights, applied after z-scoring. Ordered to match
 * `FEATURE_NAMES`; `assertWeightsAligned` fails loudly if the two drift.
 *
 * Ranking follows the design doc's tiers: what the centrepiece is and how the
 * package is shaped around him do the most work, era and timing the least.
 */
export const FEATURE_WEIGHTS: Readonly<Record<keyof TradeFeatures, number>> = {
  maxTalent: 1.5,
  maxAssetValue: 1.0,
  totalTalent: 1.0,
  talentImbalance: 1.0,
  concentration: 1.2,
  totalPlayers: 0.7,
  sideCount: 0.9,
  totalPickValue: 1.0,
  pickImbalance: 0.8,
  totalCapPct: 0.8,
  capImbalance: 0.6,
  ageMean: 0.8,
  ageSpread: 0.9,
  yearsMean: 0.9,
  expiringShare: 0.9,
  era: 0.7,
  deadline: 0.5,
};

/**
 * Weight of the archetype-agreement term, in the same standardized units as
 * everything else. Deliberately modest — see the header note. A mismatch costs
 * this much; agreement costs nothing.
 */
export const ARCHETYPE_WEIGHT = 0.8;

export function assertWeightsAligned(): void {
  const missing = FEATURE_NAMES.filter(n => !(n in FEATURE_WEIGHTS));
  if (missing.length) {
    throw new Error(`FEATURE_WEIGHTS is missing: ${missing.join(', ')}`);
  }
}

/** Corpus statistics, produced by `scripts/build-comparables-calibration.ts`. */
export interface FeatureStats {
  mean: number[];
  stdDev: number[];
}

export function standardize(vec: number[], stats: FeatureStats): number[] {
  return vec.map((v, i) => {
    const sd = stats.stdDev[i];
    // A zero-variance feature carries no information; contribute 0 rather than
    // dividing by zero and poisoning the whole distance with NaN.
    if (!sd || !Number.isFinite(sd)) return 0;
    // A feature the trade cannot supply (age with no talent to weight by, for
    // instance) sits at the corpus mean, so it contributes nothing to any
    // distance rather than reading as an extreme value in one direction.
    if (!Number.isFinite(v)) return 0;
    return (v - stats.mean[i]) / sd;
  });
}

// ── Structural gate ─────────────────────────────────────────────────

/**
 * Coarse shape of what changed hands. Computed, not labelled, so unlike
 * archetype this is safe to filter on.
 */
export type PackageShape = 'star-led' | 'pick-heavy' | 'depth';

export function packageShape(f: TradeFeatures): PackageShape {
  if (f.totalPickValue > Math.max(f.totalTalent, 1) * 1.2) return 'pick-heavy';
  if (f.concentration >= 0.5) return 'star-led';
  return 'depth';
}

export interface GateContext {
  features: TradeFeatures;
  tier: StarTier;
  shape: PackageShape;
  archetype: MotivationFlag;
  archetypeConfident: boolean;
}

export function gateContext(trade: TradeProfile): GateContext {
  const features = extractFeatures(trade);
  const { archetype, confident } = deriveArchetype(trade);
  return {
    features,
    tier: starTier(features.maxTalent),
    shape: packageShape(features),
    archetype,
    archetypeConfident: confident,
  };
}

/**
 * Does this candidate belong in the same conversation as the proposal?
 *
 * Two conditions, both label-free:
 *   - the centrepiece is within one star tier. A superstar trade and a filler
 *     trade are not comparable however well their other features line up, and
 *     this is the single check that would have stopped v1 returning
 *     Josh Minott as the closest match to the James Harden trade.
 *   - the package shape matches, or one side is 'depth' (which sits between
 *     the other two and should not be walled off from either).
 */
export function passesGate(proposal: GateContext, candidate: GateContext): boolean {
  if (tierDistance(proposal.tier, candidate.tier) > 1) return false;
  if (proposal.shape === candidate.shape) return true;
  return proposal.shape === 'depth' || candidate.shape === 'depth';
}

// ── Distance ────────────────────────────────────────────────────────

const WEIGHT_VECTOR = FEATURE_NAMES.map(n => FEATURE_WEIGHTS[n]);

/**
 * Weighted Euclidean distance between two standardized feature vectors, plus
 * the archetype-agreement term.
 *
 * Unlike v1 there is no anchor pairing and nothing is dropped: every trade
 * produces the same fixed-length vector, so a 3-team blockbuster can never be
 * scored on one of its players and a package's size is part of its identity.
 */
export function featureDistance(
  proposal: GateContext,
  candidate: GateContext,
  stats: FeatureStats,
): number {
  const a = standardize(toVector(proposal.features), stats);
  const b = standardize(toVector(candidate.features), stats);

  let sumSq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] - b[i]) * WEIGHT_VECTOR[i];
    sumSq += d * d;
  }

  // Archetype disagreement is a penalty, applied only when both sides had
  // enough data to judge. Guessing on absent data and then penalizing the
  // guess would be worse than ignoring the signal.
  if (
    proposal.archetypeConfident &&
    candidate.archetypeConfident &&
    proposal.archetype !== candidate.archetype
  ) {
    sumSq += ARCHETYPE_WEIGHT * ARCHETYPE_WEIGHT;
  }

  return Math.sqrt(sumSq);
}
