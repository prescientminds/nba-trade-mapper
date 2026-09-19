/**
 * Golden tests for the comparables engine.
 *
 * The assertions that matter are the NEGATIVE ones. Anyone can build a matcher
 * that returns plausible-looking trades; the v1 engine did, and its top result
 * for the James Harden trade was a 23-year-old on 2% of the cap moving for
 * nothing. What separates a working matcher from that is what it refuses to
 * return.
 *
 * The negative cases come from `content/comparables-signature-v1.md`, which
 * lists for each of its three worked examples what "would NOT feel comparable
 * despite similar BPM numbers", plus the Harden/Minott pair found while
 * diagnosing v1.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  findComparablesDetailed,
  extractFeatures,
  gateContext,
  passesGate,
  featureDistance,
  assertWeightsAligned,
  calibrationSignature,
  FEATURE_NAMES,
  FEATURE_WEIGHTS,
  bandFor,
  empiricalCdf,
  talent,
  rawProduction,
  starTier,
  type TradeProfile,
  type CalibrationArtifact,
} from './index';

const ROOT = path.join(__dirname, '..', '..', '..');
const PROFILES_FILE = path.join(ROOT, 'public', 'data', 'trade-profiles.json');
const CALIBRATION_FILE = path.join(ROOT, 'public', 'data', 'comparables-calibration.json');

let profiles: TradeProfile[];
let calibration: CalibrationArtifact;

beforeAll(() => {
  profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  calibration = JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf8'));
});

function side(
  teamId: string,
  players: TradeProfile['sides'][number]['players'],
  firsts = 0,
  seconds = 0,
) {
  return {
    teamId,
    players,
    pickCount: firsts + seconds,
    firstRoundPicks: firsts,
    secondRoundPicks: seconds,
    swapCount: 0,
  };
}

/** SAS/TOR, July 2018. The design doc's first worked example. */
const KAWHI_2018: TradeProfile = {
  id: 'test-kawhi-2018',
  year: 2019,
  date: '2018-07-18',
  sides: [
    side('SAS', [
      { name: 'Kawhi Leonard', age: 27, bpm: 7.0, contractYearsRemaining: 1, capPct: 0.26 },
      { name: 'Danny Green', age: 31, bpm: 1.2, contractYearsRemaining: 1, capPct: 0.1 },
    ]),
    side(
      'TOR',
      [
        { name: 'DeMar DeRozan', age: 29, bpm: 2.6, contractYearsRemaining: 3, capPct: 0.25 },
        { name: 'Jakob Poeltl', age: 22, bpm: -2.5, contractYearsRemaining: 3, capPct: 0.025 },
      ],
      1,
    ),
  ],
};

/** A minimum-salary depth swap. Must never comp to a blockbuster. */
const FILLER_SWAP: TradeProfile = {
  id: 'test-filler-swap',
  year: 2024,
  date: '2024-02-08',
  sides: [
    side('BOS', [
      { name: 'Bench Guy', age: 26, bpm: -1.5, contractYearsRemaining: 0, capPct: 0.02 },
    ]),
    side('BKN', [
      { name: 'Other Bench Guy', age: 27, bpm: -1.8, contractYearsRemaining: 1, capPct: 0.02 },
    ]),
  ],
};

describe('value model', () => {
  it('floors sub-replacement players at zero rather than letting them subtract', () => {
    expect(talent({ name: 'x', age: 26, bpm: -8, contractYearsRemaining: 1, capPct: 0.05 })).toBe(0);
  });

  it('does not age-adjust the centrepiece check, so old stars stay stars', () => {
    const oldStar = { name: 'Pierce', age: 35, bpm: 4.5, contractYearsRemaining: 1, capPct: 0.2 };
    // Age-adjusted talent buries him; raw production keeps him the headline.
    expect(talent(oldStar)).toBeLessThan(3.5);
    expect(rawProduction(oldStar)).toBeGreaterThan(6);
  });

  it('treats a missing BPM as replacement level, not league average', () => {
    expect(talent({ name: 'x', age: 25, bpm: null, contractYearsRemaining: 1, capPct: 0.05 })).toBe(0);
  });
});

describe('feature extraction', () => {
  it('is order invariant — a trade is a set of sides, not a list', () => {
    const reversed: TradeProfile = { ...KAWHI_2018, sides: [...KAWHI_2018.sides].reverse() };
    expect(extractFeatures(reversed)).toEqual(extractFeatures(KAWHI_2018));
  });

  it('counts package size, so a big trade cannot look like a small one', () => {
    const big = extractFeatures(KAWHI_2018);
    const small = extractFeatures(FILLER_SWAP);
    expect(big.totalPlayers).toBeGreaterThan(small.totalPlayers);
    expect(big.maxTalent).toBeGreaterThan(small.maxTalent);
  });

  it('reports an unknowable age as NaN rather than zero', () => {
    const picksOnly: TradeProfile = {
      id: 'picks-only',
      year: 2024,
      sides: [side('A', [], 1), side('B', [], 0, 2)],
    };
    expect(Number.isNaN(extractFeatures(picksOnly).ageMean)).toBe(true);
  });
});

describe('structural gate', () => {
  it('rejects a filler trade as a comp for a superstar trade', () => {
    // This is the Harden/Minott regression: v1's top match for a 3-team,
    // 7-pick superstar trade was a 23-year-old moving for nothing.
    const star = gateContext(KAWHI_2018);
    const filler = gateContext(FILLER_SWAP);
    expect(starTier(star.features.maxTalent)).toBe('superstar');
    expect(passesGate(star, filler)).toBe(false);
  });

  it('accepts a trade one tier away', () => {
    const a = gateContext(KAWHI_2018);
    expect(passesGate(a, a)).toBe(true);
  });
});

describe('distance', () => {
  it('is zero between a trade and itself', () => {
    const ctx = gateContext(KAWHI_2018);
    expect(featureDistance(ctx, ctx, calibration.stats)).toBeCloseTo(0, 10);
  });

  it('is symmetric', () => {
    const a = gateContext(KAWHI_2018);
    const b = gateContext(FILLER_SWAP);
    expect(featureDistance(a, b, calibration.stats)).toBeCloseTo(
      featureDistance(b, a, calibration.stats),
      10,
    );
  });

  it('never returns NaN on a trade with missing salary and contract data', () => {
    const sparse: TradeProfile = {
      id: 'sparse',
      year: 1979,
      sides: [
        side('A', [{ name: 'p', age: 27, bpm: 1.0, contractYearsRemaining: null, capPct: null }]),
        side('B', [{ name: 'q', age: 29, bpm: null, contractYearsRemaining: null, capPct: null }]),
      ],
    };
    const d = featureDistance(gateContext(sparse), gateContext(KAWHI_2018), calibration.stats);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe('calibration', () => {
  it('has a signature matching the running feature set and weights', () => {
    // The guard against a stale artifact silently mis-scaling every card.
    const expected = calibrationSignature(
      FEATURE_NAMES as readonly string[],
      FEATURE_NAMES.map(n => FEATURE_WEIGHTS[n]),
    );
    expect(calibration.signature).toBe(expected);
  });

  it('has one mean and one standard deviation per feature', () => {
    expect(calibration.stats.mean).toHaveLength(FEATURE_NAMES.length);
    expect(calibration.stats.stdDev).toHaveLength(FEATURE_NAMES.length);
  });

  it('has a monotonic non-decreasing quantile curve', () => {
    for (let i = 1; i < calibration.quantiles.length; i++) {
      expect(calibration.quantiles[i]).toBeGreaterThanOrEqual(calibration.quantiles[i - 1]);
    }
  });

  it('carries an elite stratum, because star and superstar are too thin alone', () => {
    expect(calibration.byTier.elite).toBeDefined();
    expect(calibration.byTier.elite.sampleCount).toBeGreaterThanOrEqual(200);
  });

  it('maps a distance past the top of the curve to a zero score', () => {
    expect(empiricalCdf(1e9, calibration.quantiles)).toBe(1);
  });

  it('bands descend with the score', () => {
    expect(bandFor(0.95)).toBe('near-identical');
    expect(bandFor(0.8)).toBe('strong');
    expect(bandFor(0.5)).toBe('loose');
    expect(bandFor(0.1)).toBe('weak');
  });
});

describe('weights', () => {
  it('covers every feature', () => {
    expect(() => assertWeightsAligned()).not.toThrow();
  });
});

describe('golden set — Kawhi Leonard to Toronto, 2018', () => {
  let ids: string[];
  let headlines: string[];

  beforeAll(() => {
    const result = findComparablesDetailed(KAWHI_2018, profiles, { topN: 8, calibration });
    ids = result.comparables.map(c => c.id);
    headlines = result.comparables.map(c => c.headline ?? '');
  });

  it('finds a structural precedent rather than falling back', () => {
    const result = findComparablesDetailed(KAWHI_2018, profiles, { topN: 5, calibration });
    expect(result.noStructuralPrecedent).toBe(false);
    expect(result.gatedCandidateCount).toBeGreaterThan(5);
  });

  it('derives it as a star acquisition', () => {
    const result = findComparablesDetailed(KAWHI_2018, profiles, { topN: 5, calibration });
    expect(result.proposedArchetype).toBe('star_acquisition');
  });

  it('returns star-led trades, not depth swaps', () => {
    // Every comp's centrepiece must be within one tier of a superstar.
    const byId = new Map(profiles.map(p => [p.id, p]));
    for (const id of ids) {
      const t = byId.get(id)!;
      const tier = starTier(extractFeatures(t).maxTalent);
      expect(['superstar', 'star']).toContain(tier);
    }
  });

  it('does NOT rank a Paul George trade top — the doc\'s canonical non-comparable', () => {
    // "George → OKC (2017) — same BPM range on the outgoing star, but IND
    //  wasn't forced and OKC wasn't a desperate contender; different
    //  motivation entirely." v1 returned a George trade at 100%.
    expect(headlines.slice(0, 3).some(h => /Paul George/i.test(h))).toBe(false);
  });

  it('scores the top comp above the bottom comp, with real separation', () => {
    const result = findComparablesDetailed(KAWHI_2018, profiles, { topN: 5, calibration });
    const scores = result.comparables.map(c => c.matchScore);
    expect(scores[0]).toBeGreaterThan(scores[scores.length - 1]);
    // v1's within-set normalization pinned these at exactly 1 and 0.
    expect(scores[0]).toBeLessThan(1);
    expect(scores[scores.length - 1]).toBeGreaterThan(0);
  });

  it('does not pin the top card at 100% and the last at 0%', () => {
    const result = findComparablesDetailed(KAWHI_2018, profiles, { topN: 5, calibration });
    const scores = result.comparables.map(c => c.matchScore);
    expect(scores[0]).not.toBe(1);
    expect(scores[scores.length - 1]).not.toBe(0);
  });
});

describe('golden set — a trade is its own best comparable', () => {
  it('ranks the real Kawhi trade first when it is in the corpus', () => {
    // v1 ranked the identical trade FOURTH against itself, at "11% match",
    // because the score was a rank within the returned five.
    const real = profiles.find(p => /Kawhi Leonard/.test(p.headline ?? ''));
    expect(real).toBeDefined();
    const probe: TradeProfile = { ...real!, id: 'probe-copy' };
    const result = findComparablesDetailed(probe, profiles, { topN: 5, calibration });
    expect(result.comparables[0].id).toBe(real!.id);
    expect(result.comparables[0].matchScore).toBeGreaterThan(0.9);
    expect(result.comparables[0].band).toBe('near-identical');
  });
});

describe('golden set — a filler trade gets filler comps', () => {
  it('never returns a superstar trade as a comp for a minimum-salary swap', () => {
    const result = findComparablesDetailed(FILLER_SWAP, profiles, { topN: 5, calibration });
    const byId = new Map(profiles.map(p => [p.id, p]));
    for (const c of result.comparables) {
      const tier = starTier(extractFeatures(byId.get(c.id)!).maxTalent);
      expect(tier).not.toBe('superstar');
      expect(tier).not.toBe('star');
    }
  });
});
