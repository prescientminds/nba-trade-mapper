/**
 * Archetype derivation — what *kind* of trade is this?
 *
 * The design doc (`content/comparables-signature-v1.md`) ranks motivation as
 * the strongest similarity signal, above every box-score feature. Two salary
 * dumps resemble each other more than a salary dump resembles a star
 * acquisition with identical BPM deltas.
 *
 * It is derived rather than hand-tagged because the user's in-progress trade
 * has no tag and never will. A derived archetype is computable on both sides of
 * the comparison, so the proposal and the corpus get identical treatment. The
 * 100 hand tags recovered from the stash are the validation set instead — see
 * `scripts/validate-archetypes.ts`.
 *
 * ## Why this is a soft signal, not a hard gate
 *
 * The doc's Stage 1 called for filtering candidates to the same archetype.
 * Measured against the hand tags, derivation tops out around the accuracy of
 * the labels themselves, which are noisy — Chris Webber to Sacramento is tagged
 * `reshuffle`, and 68 of 100 tags are `reshuffle` in a way that reads as a
 * default rather than a judgement. A hard gate on a signal that wrong would
 * silently discard good precedents. So archetype contributes a weighted term to
 * the distance, and the structural gate uses only quantities computed directly
 * from the data (star tier, package shape), which carry no label noise.
 *
 * ## What cannot be derived
 *
 * `forced_exit` encodes a public trade request — external context no box score
 * recovers. It is never returned. Hand tags keep it; the validator scores it
 * separately rather than pretending the deriver had a chance.
 */

import type { TradeProfile, MotivationFlag } from './types';
import { extractSideFeatures } from './features';
import { starTier, talent, rawProduction, headlinePlayer, pickValue } from './value';

export const ARCHETYPE_THRESHOLDS = {
  /**
   * Raw BPM production (age-unadjusted) marking the trade's centrepiece.
   * Age-adjusted `talent` is wrong for this question: it drops a 35-year-old
   * Paul Pierce to 2.5 and hides that he was the headline of his trade.
   */
  starProduction: 6.0,
  /** Draft capital that reads as a sweetener rather than an asset in its own right. */
  sweetenerPickValue: 8,
  /** Talent a shedding side may take back and still be shedding. */
  dumpReturnTalentRatio: 0.7,
  /** Age gap between sides that reads as youth-for-experience. */
  teardownAgeGap: 2.5,
  /** Draft capital returning to the seller in a teardown. */
  teardownPickValue: 10,
} as const;

export interface ArchetypeResult {
  archetype: MotivationFlag;
  /** Short phrases for the card's "Matched on" row. */
  reasons: string[];
  /**
   * False when the trade lacks the data to judge — a side with no resolvable
   * players, or missing salary. Callers should weight the archetype term down
   * to zero rather than trusting a guess made on absent data.
   */
  confident: boolean;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * Can we say anything at all? A side with zero resolvable players looks like it
 * sent nothing, which previously made one-sided trades read as salary dumps —
 * the Roy Hinson 1986 false positive. Salary archetypes additionally need cap
 * data on every side; roughly 16% of player rows have none, almost all pre-1990.
 */
function dataQuality(trade: TradeProfile): { everySideHasPlayers: boolean; everySideHasSalary: boolean } {
  let everySideHasPlayers = true;
  let everySideHasSalary = true;
  for (const side of trade.sides) {
    if (side.players.length === 0) everySideHasPlayers = false;
    if (!side.players.some(p => p.capPct != null)) everySideHasSalary = false;
  }
  return { everySideHasPlayers, everySideHasSalary };
}

export function deriveArchetype(trade: TradeProfile): ArchetypeResult {
  const T = ARCHETYPE_THRESHOLDS;
  if (trade.sides.length < 2) return { archetype: 'reshuffle', reasons: [], confident: false };

  const sides = trade.sides.map(extractSideFeatures);
  const quality = dataQuality(trade);

  // Centrepiece: the best player moving, by raw production, and where he came from.
  let centrepiece: { production: number; talent: number; years: number | null; from: string } | null = null;
  for (const side of trade.sides) {
    const h = headlinePlayer(side.players);
    if (!h) continue;
    const prod = rawProduction(h);
    if (!centrepiece || prod > centrepiece.production) {
      centrepiece = {
        production: prod,
        talent: talent(h),
        years: h.contractYearsRemaining,
        from: side.teamId,
      };
    }
  }
  const isStar = (centrepiece?.production ?? 0) >= T.starProduction;

  // ── 1. Salary dump ────────────────────────────────────────────────
  // The naive signature — one side sends far more money — barely exists,
  // because CBA salary matching forces most trades close to cap-neutral. Baron
  // Davis to Cleveland moved 22.4% of the cap out and 21.2% back in.
  //
  // The real tell is the sweetener: a side attaching draft capital to move a
  // contract, and taking back less talent than it sent. That is what the first
  // in the Baron Davis trade was, and it became Kyrie Irving.
  if (quality.everySideHasPlayers && quality.everySideHasSalary) {
    for (let i = 0; i < trade.sides.length; i++) {
      const side = sides[i];
      const others = sides.filter((_, j) => j !== i);
      const attachedPicks = pickValue(trade.sides[i]) >= T.sweetenerPickValue;
      const sentMoreSalary = side.capPctTotal > sum(others.map(o => o.capPctTotal)) * 0.9;
      const tookLessTalent =
        side.talentTotal > 0 &&
        sum(others.map(o => o.talentTotal)) <= side.talentTotal * T.dumpReturnTalentRatio;
      if (attachedPicks && sentMoreSalary && tookLessTalent && !isStar) {
        return {
          archetype: 'salary_dump',
          reasons: ['draft capital attached to move salary', 'less talent coming back'],
          confident: true,
        };
      }
    }
  }

  // ── 2. Rental ─────────────────────────────────────────────────────
  // Defined by the contract, not the package: an expiring centrepiece changing
  // hands in the deadline window.
  if (
    centrepiece &&
    centrepiece.years === 0 &&
    centrepiece.production >= T.starProduction * 0.5 &&
    trade.date?.slice(5, 7) === '02'
  ) {
    return {
      archetype: 'rental',
      reasons: ['expiring centrepiece', 'deadline acquisition'],
      confident: true,
    };
  }

  if (isStar && centrepiece) {
    const sellerSide = sides.find(s => s.teamId === centrepiece.from);
    const returnSides = sides.filter(s => s !== sellerSide);
    const returnAges = returnSides.filter(s => s.talentTotal > 0).map(s => s.ageMean);
    const returnPickValue = sum(returnSides.map(s => s.pickValue));
    const ageGap =
      sellerSide && sellerSide.ageMean > 0 && returnAges.length
        ? sellerSide.ageMean - Math.min(...returnAges)
        : 0;

    // ── 3. Teardown ─────────────────────────────────────────────────
    // The centrepiece leaves; youth and draft capital come back. The
    // discriminator against star_acquisition is the direction of the age
    // exchange — a rebuilding seller takes back players younger than the one
    // it sent, plus picks.
    if (ageGap >= T.teardownAgeGap && returnPickValue >= T.teardownPickValue) {
      return {
        archetype: 'teardown',
        reasons: ['centrepiece sold for youth and picks', 'seller gets younger'],
        confident: quality.everySideHasPlayers,
      };
    }

    // ── 4. Star acquisition ─────────────────────────────────────────
    return {
      archetype: 'star_acquisition',
      reasons: [
        `${starTier(centrepiece.talent)}-tier centrepiece`,
        returnPickValue > 0 ? 'picks in the package' : 'player-for-player',
      ],
      confident: quality.everySideHasPlayers,
    };
  }

  // ── 5. Reshuffle ──────────────────────────────────────────────────
  // The honest default, and the most common outcome in the hand-tagged corpus.
  const reasons: string[] = [];
  if (centrepiece) reasons.push(`${starTier(centrepiece.talent)}-tier headline`);
  if (sides.some(s => s.pickCount > 0)) reasons.push('picks involved');
  return { archetype: 'reshuffle', reasons, confident: quality.everySideHasPlayers };
}
