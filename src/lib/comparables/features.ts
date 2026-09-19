/**
 * Feature extraction: a TradeProfile becomes a fixed-length numeric vector.
 *
 * Design constraints that drove this:
 *
 * 1. **Order invariance.** A trade is a set of sides, not a list. Nothing here
 *    may depend on which team happens to be first in the array, so every
 *    cross-side feature is a symmetric function (total, range, ratio).
 *
 * 2. **Package size is signal, not noise.** v1 greedily paired anchors and
 *    dropped whatever didn't pair, so a 3-team blockbuster could be scored on a
 *    single role player. Counts and totals are features here, so a 7-pick
 *    3-teamer can never look like a 1-for-1.
 *
 * 3. **Everything computable on both sides.** The user's in-progress trade goes
 *    through exactly this function, so no feature may depend on data that only
 *    exists for historical trades. That rules out team records — the trade
 *    machine surface does not fetch `team_seasons` — which is why posture is
 *    absent despite the design doc ranking it Tier 2. Noted as the next feature
 *    to add, once the builder fetches records.
 */

import type { TradeProfile, TeamSide } from './types';
import { talent, assetValue, headlinePlayer, pickValue, totalPicks } from './value';
import { eraIndex, isDeadlineWindow } from './era';

/** Per-side aggregates. Intermediate — the distance works on TradeFeatures. */
export interface SideFeatures {
  teamId: string;
  /** Sum of on-court value sent by this side. */
  talentTotal: number;
  /** Sum of contract-adjusted value sent by this side. */
  assetTotal: number;
  /** Best single player's on-court value. */
  talentTop: number;
  playerCount: number;
  pickValue: number;
  pickCount: number;
  /** Total salary sent, as a share of that season's cap. */
  capPctTotal: number;
  /** Value-weighted mean age of players sent. 0 when the side sends no players. */
  ageMean: number;
  /** Value-weighted mean contract years remaining. */
  yearsMean: number;
  /** Share of this side's talent that sits on expiring deals. */
  expiringShare: number;
}

export function extractSideFeatures(side: TeamSide): SideFeatures {
  let talentTotal = 0;
  let assetTotal = 0;
  let talentTop = 0;
  let ageWeighted = 0;
  let yearsWeighted = 0;
  let yearsWeight = 0;
  let expiringTalent = 0;
  let capPctTotal = 0;

  for (const p of side.players) {
    const t = talent(p);
    talentTotal += t;
    assetTotal += assetValue(p);
    if (t > talentTop) talentTop = t;
    ageWeighted += p.age * t;
    if (p.capPct != null) capPctTotal += p.capPct;
    if (p.contractYearsRemaining != null) {
      yearsWeighted += p.contractYearsRemaining * t;
      yearsWeight += t;
      if (p.contractYearsRemaining === 0) expiringTalent += t;
    }
  }

  const pv = pickValue(side);
  return {
    teamId: side.teamId,
    talentTotal,
    assetTotal: assetTotal + pv,
    talentTop,
    playerCount: side.players.length,
    pickValue: pv,
    pickCount: totalPicks(side),
    capPctTotal,
    ageMean: talentTotal > 0 ? ageWeighted / talentTotal : 0,
    yearsMean: yearsWeight > 0 ? yearsWeighted / yearsWeight : 0,
    expiringShare: talentTotal > 0 ? expiringTalent / talentTotal : 0,
  };
}

/**
 * The 17-dimension trade vector. Field order is load-bearing: `toVector` and
 * the weight table in `distance.ts` both depend on it, and the calibration
 * artifact stores a hash over the names so a silent reordering can't
 * invalidate a shipped calibration without failing loudly.
 */
export interface TradeFeatures {
  /** Best single player anywhere in the trade, on the talent scale. */
  maxTalent: number;
  /** Best single contract-adjusted asset anywhere in the trade. */
  maxAssetValue: number;
  /** Sum of on-court value across every side. Trade "size". */
  totalTalent: number;
  /** How lopsided the talent flow is: (max side − min side) / total, 0..1. */
  talentImbalance: number;
  /** How much of the trade's talent sits in its single best player, 0..1.
   *  High = "paper" (one star), low = "coins" (a package of pieces). */
  concentration: number;
  totalPlayers: number;
  sideCount: number;
  totalPickValue: number;
  /** How one-directional the draft capital is, 0..1. */
  pickImbalance: number;
  /** Total salary in motion, as a share of the cap. */
  totalCapPct: number;
  /** How one-directional the money is, 0..1. */
  capImbalance: number;
  /** Value-weighted mean age across the whole trade. */
  ageMean: number;
  /** Gap between the oldest and youngest side by mean age. Young-for-old. */
  ageSpread: number;
  /** Value-weighted mean contract years remaining. */
  yearsMean: number;
  /** Share of all talent on expiring deals, 0..1. */
  expiringShare: number;
  /** CBA regime as an ordinal, 0 = pre-1999 through 5 = second apron. */
  era: number;
  /** 1 when the trade landed in the February deadline window. */
  deadline: number;
}

export const FEATURE_NAMES: ReadonlyArray<keyof TradeFeatures> = [
  'maxTalent',
  'maxAssetValue',
  'totalTalent',
  'talentImbalance',
  'concentration',
  'totalPlayers',
  'sideCount',
  'totalPickValue',
  'pickImbalance',
  'totalCapPct',
  'capImbalance',
  'ageMean',
  'ageSpread',
  'yearsMean',
  'expiringShare',
  'era',
  'deadline',
] as const;

/** Normalized range over a set of per-side quantities. 0 when nothing moved. */
function imbalance(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  return (Math.max(...values) - Math.min(...values)) / sum;
}

export function extractFeatures(trade: TradeProfile): TradeFeatures {
  const sides = trade.sides.map(extractSideFeatures);
  if (sides.length === 0) {
    throw new Error(`Trade ${trade.id} has no sides`);
  }

  const totalTalent = sides.reduce((a, s) => a + s.talentTotal, 0);
  const totalCapPct = sides.reduce((a, s) => a + s.capPctTotal, 0);

  let maxTalent = 0;
  let maxAssetValue = 0;
  for (const side of trade.sides) {
    const h = headlinePlayer(side.players);
    if (!h) continue;
    maxTalent = Math.max(maxTalent, talent(h));
    for (const p of side.players) maxAssetValue = Math.max(maxAssetValue, assetValue(p));
  }

  // Age spread only means something across sides that actually sent talent —
  // a side that sends nothing but picks has ageMean 0 and would otherwise read
  // as an infinitely young package.
  const ageMeans = sides.filter(s => s.talentTotal > 0).map(s => s.ageMean);
  const ageSpread = ageMeans.length > 1 ? Math.max(...ageMeans) - Math.min(...ageMeans) : 0;

  // NaN, not 0, when there is no talent to weight by. Age 0 is not a young
  // trade — it is an unknown one, and feeding 0 into a z-score turns every
  // pick-only trade into a massive outlier on the age axis. `standardize`
  // maps a non-finite feature to the corpus mean, so it contributes nothing.
  const ageMean =
    totalTalent > 0
      ? sides.reduce((a, s) => a + s.ageMean * s.talentTotal, 0) / totalTalent
      : NaN;
  const yearsMean =
    totalTalent > 0
      ? sides.reduce((a, s) => a + s.yearsMean * s.talentTotal, 0) / totalTalent
      : NaN;
  const expiringShare =
    totalTalent > 0
      ? sides.reduce((a, s) => a + s.expiringShare * s.talentTotal, 0) / totalTalent
      : NaN;

  return {
    maxTalent,
    maxAssetValue,
    totalTalent,
    talentImbalance: imbalance(sides.map(s => s.talentTotal)),
    concentration: totalTalent > 0 ? maxTalent / totalTalent : 0,
    totalPlayers: sides.reduce((a, s) => a + s.playerCount, 0),
    sideCount: sides.length,
    totalPickValue: sides.reduce((a, s) => a + s.pickValue, 0),
    pickImbalance: imbalance(sides.map(s => s.pickValue)),
    totalCapPct,
    capImbalance: imbalance(sides.map(s => s.capPctTotal)),
    ageMean,
    ageSpread,
    yearsMean,
    expiringShare,
    era: eraIndex(trade),
    deadline: isDeadlineWindow(trade) ? 1 : 0,
  };
}

export function toVector(f: TradeFeatures): number[] {
  return FEATURE_NAMES.map(n => f[n]);
}
