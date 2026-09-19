/**
 * Trade Machine comparables engine (v2).
 *
 * Given a proposed trade, find the historical trades that are genuinely like
 * it, and say how like it they are on a scale that means something.
 *
 * ## What changed from v1, and why
 *
 * v1 was a nearest-neighbour search on two features — the BPM and age of the
 * single highest-BPM player per side — with era as a multiplier and the result
 * min-max normalized inside the returned five. Four things were wrong with it:
 *
 *   1. Two dimensions over 1,551 candidates means everything has a "perfect"
 *      comp. Sampling 300k historical pairs, a random proposal's top five
 *      always landed in the 99th-100th percentile of similarity.
 *   2. Greedy anchor pairing dropped whatever it could not pair, so a 3-team
 *      blockbuster could be graded on one role player. The closest match to
 *      the James Harden trade was Josh Minott moving for nothing.
 *   3. The era multiplier was a flat recency bias, because the proposed
 *      trade's year was hardcoded — pre-2000 trades were multiplied out of
 *      contention regardless of fit.
 *   4. Within-set normalization meant the top card always read 100% and the
 *      fifth always 0%. Querying the Kawhi Leonard trade returned the Kawhi
 *      Leonard trade at "11% match".
 *
 * v2 extracts a 17-dimension vector per trade, z-scores it against corpus
 * statistics, applies a weighted Euclidean distance with a structural gate,
 * and maps the result through a calibrated CDF so the score is absolute.
 *
 * Still pure — no Supabase, no fetch. The caller supplies the candidate
 * profiles and the calibration artifact.
 */

import type {
  TradeProfile,
  Comparable,
  ComparablesResult,
  MatchFactors,
  MotivationFlag,
} from './types';
import { headlinePlayer, talent } from './value';
import { gateContext, passesGate, featureDistance, type GateContext } from './distance';
import {
  matchScoreFor,
  bandFor,
  quantilesForTier,
  type CalibrationArtifact,
} from './calibration';

export * from './types';
export { deriveArchetype } from './archetype';
export { extractFeatures, FEATURE_NAMES, type TradeFeatures } from './features';
export {
  FEATURE_WEIGHTS,
  ARCHETYPE_WEIGHT,
  packageShape,
  gateContext,
  passesGate,
  featureDistance,
  assertWeightsAligned,
  type FeatureStats,
  type GateContext,
  type PackageShape,
} from './distance';
export {
  bandFor,
  BAND_LABELS,
  BAND_THRESHOLDS,
  matchScoreFor,
  quantilesForTier,
  empiricalCdf,
  calibrationSignature,
  type CalibrationArtifact,
} from './calibration';
export {
  talent,
  assetValue,
  rawProduction,
  headlinePlayer,
  starTier,
  ageMultiplier,
  pickValue,
  type StarTier,
} from './value';
export { eraLabel, eraIndex, ERA_LABELS } from './era';

export interface FindComparablesOptions {
  topN?: number;
  /**
   * Corpus statistics and the distance-to-percentile curve. Required: without
   * it there is no absolute scale, and inventing one from the returned handful
   * would reproduce exactly the v1 bug this replaces.
   */
  calibration: CalibrationArtifact;
}

/** The headline players of each trade, for the card's rationale line. */
function buildFactors(proposed: TradeProfile, candidate: TradeProfile): MatchFactors | null {
  const pick = (t: TradeProfile) => {
    let best: ReturnType<typeof headlinePlayer> = null;
    let bestTalent = -1;
    for (const side of t.sides) {
      const h = headlinePlayer(side.players);
      if (!h) continue;
      const v = talent(h);
      if (v > bestTalent) {
        best = h;
        bestTalent = v;
      }
    }
    return best;
  };
  const p = pick(proposed);
  const c = pick(candidate);
  if (!p || !c) return null;
  return {
    proposedAnchor: { name: p.name, age: p.age, bpm: p.bpm },
    candidateAnchor: { name: c.name, age: c.age, bpm: c.bpm },
    bpmDelta: p.bpm != null && c.bpm != null ? p.bpm - c.bpm : null,
    ageDelta: p.age - c.age,
    eraGap: proposed.year - candidate.year,
  };
}

/** Human-readable reasons, for the card's "Matched on" row. */
function matchedOn(proposal: GateContext, candidate: GateContext): string[] {
  const out: string[] = [];
  if (proposal.tier === candidate.tier) out.push(`${candidate.tier}-tier centrepiece`);
  if (proposal.shape === candidate.shape) out.push(`${candidate.shape} package`);
  if (
    proposal.archetypeConfident &&
    candidate.archetypeConfident &&
    proposal.archetype === candidate.archetype
  ) {
    out.push(candidate.archetype.replace(/_/g, ' '));
  }
  if (proposal.features.era === candidate.features.era) out.push('same CBA era');
  if (proposal.features.deadline === 1 && candidate.features.deadline === 1) {
    out.push('deadline trade');
  }
  return out;
}

/**
 * Rank historical candidates against a proposed trade.
 *
 * Candidates pass a structural gate first — centrepiece within one star tier,
 * compatible package shape — and are then ranked by calibrated distance. When
 * nothing clears the gate the search falls back to the unfiltered corpus and
 * flags `noStructuralPrecedent`, so the UI can say there is no real precedent
 * rather than presenting five weak matches as though they were strong.
 */
export function findComparablesDetailed(
  proposed: TradeProfile,
  candidates: TradeProfile[],
  opts: FindComparablesOptions,
): ComparablesResult {
  const topN = opts.topN ?? 5;
  const { calibration } = opts;
  const proposal = gateContext(proposed);

  const pool = candidates.filter(c => c.id !== proposed.id);
  const contexts = new Map<string, GateContext>();
  for (const c of pool) {
    try {
      contexts.set(c.id, gateContext(c));
    } catch {
      // A malformed profile (no sides) is skipped rather than failing the
      // whole search.
    }
  }

  const gated = pool.filter(c => {
    const ctx = contexts.get(c.id);
    return ctx ? passesGate(proposal, ctx) : false;
  });

  const noStructuralPrecedent = gated.length === 0;
  const searchSet = noStructuralPrecedent ? pool.filter(c => contexts.has(c.id)) : gated;

  const scored = searchSet
    .map(c => {
      const ctx = contexts.get(c.id)!;
      return { trade: c, ctx, distance: featureDistance(proposal, ctx, calibration.stats) };
    })
    .filter(s => Number.isFinite(s.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);

  // Score against the curve for the proposal's own star tier — see the note on
  // `byTier` in calibration.ts. Comparing a blockbuster against the comps that
  // routine trades get would mark every blockbuster "no real precedent".
  const curve = quantilesForTier(calibration, proposal.tier);

  const comparables: Comparable[] = scored.map(s => {
    const score = matchScoreFor(s.distance, curve);
    return {
      id: s.trade.id,
      matchScore: score,
      band: bandFor(score),
      structural: !noStructuralPrecedent,
      archetype: s.ctx.archetypeConfident ? s.ctx.archetype : undefined,
      matchedOn: matchedOn(proposal, s.ctx),
      motivation: s.trade.motivation,
      headline: s.trade.headline,
      outcomeSummary: s.trade.outcomeSummary,
      year: s.trade.year,
      factors: buildFactors(proposed, s.trade) ?? undefined,
    };
  });

  return {
    comparables,
    proposedArchetype: proposal.archetype,
    noStructuralPrecedent,
    gatedCandidateCount: gated.length,
  };
}

/** Back-compatible shape: just the ranked list. */
export function findComparables(
  proposed: TradeProfile,
  candidates: TradeProfile[],
  opts: FindComparablesOptions,
): Comparable[] {
  return findComparablesDetailed(proposed, candidates, opts).comparables;
}

/**
 * Aggregate verdict across the returned comparables — the design doc's card
 * copy, "based on 68% of comparables where the contender won".
 *
 * Profiles with no recorded winner are excluded from the numerator but kept in
 * the denominator's honesty: the returned `sampled` count says how many of the
 * comparables actually carried an outcome, so the UI never implies more
 * evidence than exists.
 */
export function aggregateOutcome(comparables: Comparable[]): {
  sampled: number;
  total: number;
  summary: string | null;
} {
  const withOutcome = comparables.filter(c => c.outcomeSummary);
  if (withOutcome.length === 0) {
    return { sampled: 0, total: comparables.length, summary: null };
  }
  return {
    sampled: withOutcome.length,
    total: comparables.length,
    summary: `${withOutcome.length} of ${comparables.length} comparables have a recorded verdict`,
  };
}

export type { MotivationFlag };
