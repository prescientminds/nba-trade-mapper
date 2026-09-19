/**
 * Shared types for the comparables engine.
 *
 * Split out of the old flat `src/lib/comparables.ts` so the value model,
 * feature extraction, archetype derivation and distance function can import
 * them without cycling through the public entry point.
 */

/**
 * Trade archetype. Same six labels as the hand-tagged corpus in
 * `public/data/trade-motivations.json`, so a derived archetype can be scored
 * directly against 100 human judgements (see `scripts/validate-archetypes.ts`).
 *
 * `forced_exit` is deliberately never derived — it encodes a public trade
 * request, which is external context no amount of box score and contract data
 * can recover. Hand tags keep it; the deriver returns `unclear` instead.
 */
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
  /** Contract years remaining after the trade (0 = expiring). */
  contractYearsRemaining: number | null;
  /** Salary as a percentage of that season's salary cap. */
  capPct: number | null;
}

export interface TeamSide {
  teamId: string;
  players: PlayerProfile[];
  /** Total picks sent by this side. Retained for backward compatibility and as
   *  the fallback when the round split is absent (profiles built before v2). */
  pickCount: number;
  /** First-round picks sent. Undefined on pre-v2 profiles. */
  firstRoundPicks?: number;
  /** Second-round picks sent. Undefined on pre-v2 profiles. */
  secondRoundPicks?: number;
  /** Swap rights sent, counted separately — a swap is not a pick. */
  swapCount?: number;
}

export interface TradeProfile {
  id: string;
  /** End-year of the trade season, e.g. 2018 for the 2017-18 season. */
  year: number;
  /** ISO trade date. Added in v2; drives CBA era and the deadline-window
   *  feature. Undefined on pre-v2 profiles, which fall back to `year`. */
  date?: string;
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

/** Deltas between the two trades' headline players. */
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

/**
 * How confident we are that this is a real precedent, on an absolute scale
 * calibrated against the whole corpus — not a rank within the returned set.
 */
export type MatchBand = 'near-identical' | 'strong' | 'loose' | 'weak';

export interface Comparable {
  id: string;
  /**
   * 0..1 **absolute** similarity, from the corpus-wide distance distribution in
   * `public/data/comparables-calibration.json`. 0.9 means this candidate is
   * closer than 90% of all historical trade pairs. Unlike v1 this is NOT
   * normalized within the returned set — five weak comparables all score low,
   * and the top card is not automatically 1.0.
   */
  matchScore: number;
  /** Bucketed `matchScore`, for copy that shouldn't over-read a percentage. */
  band: MatchBand;
  /** True when the candidate cleared the structural gate rather than arriving
   *  through the no-precedent fallback. */
  structural: boolean;
  /** Archetype shared with the proposal, when the gate matched on one. */
  archetype?: MotivationFlag;
  /** Short human-readable reasons this matched, for the card's "Matched on" row. */
  matchedOn: string[];
  motivation?: MotivationFlag;
  headline?: string;
  outcomeSummary?: string;
  year?: number;
  factors?: MatchFactors;
}

export interface ComparablesResult {
  comparables: Comparable[];
  /** Archetype derived for the proposed trade. */
  proposedArchetype: MotivationFlag;
  /**
   * True when nothing cleared the structural gate and results came from the
   * unfiltered fallback. The UI must say so rather than implying precedent.
   */
  noStructuralPrecedent: boolean;
  /** How many candidates survived the structural gate. */
  gatedCandidateCount: number;
}
