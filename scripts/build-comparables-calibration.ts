/**
 * Build the calibration artifact the comparables engine scores against.
 *
 * Two things come out of one pass over the corpus:
 *
 *   stats      — per-feature mean and standard deviation, so the distance
 *                function can z-score. Without this the weights in
 *                distance.ts are meaningless, because the raw features are in
 *                wildly different units.
 *   quantiles  — the distance at each percentile of the distribution of
 *                NEAREST-NEIGHBOUR distances across the corpus. This is what
 *                turns a raw distance into "a better comp than 90% of the
 *                comps any trade gets", which is a statement a person can act
 *                on, unlike v1's rank-within-the-returned-five.
 *
 * Must be re-run whenever the feature list or the weights change. The artifact
 * carries a signature over both and the engine refuses a stale one.
 *
 *   npx tsx scripts/build-comparables-calibration.ts
 *   npx tsx scripts/build-comparables-calibration.ts --report   # spread diagnostics, no write
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  extractFeatures,
  toVector,
  FEATURE_NAMES,
} from '../src/lib/comparables/features';
import {
  FEATURE_WEIGHTS,
  gateContext,
  featureDistance,
  passesGate,
  assertWeightsAligned,
  type FeatureStats,
} from '../src/lib/comparables/distance';
import {
  calibrationSignature,
  matchScoreFor,
  bandFor,
  quantilesForTier,
  calibrationStratum,
  MIN_TIER_SAMPLES,
  type CalibrationArtifact,
} from '../src/lib/comparables/calibration';
import type { TradeProfile } from '../src/lib/comparables/types';

const PROFILES = path.join(__dirname, '..', 'public', 'data', 'trade-profiles.json');
const OUT_FILE = path.join(__dirname, '..', 'public', 'data', 'comparables-calibration.json');

const ARTIFACT_VERSION = 1;
const PERCENTILE_STEPS = 100;
/** Neighbours per corpus trade contributed to the reference distribution. */
const TOP_K = 5;

/**
 * Deterministic PRNG. A calibration that shifts on every run would make the
 * displayed score drift without any code change, and would make the signature
 * check meaningless as a guarantee of reproducibility.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeStats(profiles: TradeProfile[]): FeatureStats {
  const vectors: number[][] = [];
  for (const p of profiles) {
    try {
      vectors.push(toVector(extractFeatures(p)));
    } catch {
      // Malformed profile; excluded from the corpus statistics.
    }
  }
  // Per-dimension counts, because a feature can be NaN for a trade that cannot
  // supply it (age with no talent to weight by). Those rows are excluded from
  // that dimension's mean and spread rather than being counted as zero.
  const dims = FEATURE_NAMES.length;
  const mean = new Array(dims).fill(0);
  const stdDev = new Array(dims).fill(0);
  const n = new Array(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      if (!Number.isFinite(v[i])) continue;
      mean[i] += v[i];
      n[i]++;
    }
  }
  for (let i = 0; i < dims; i++) mean[i] /= n[i] || 1;
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      if (!Number.isFinite(v[i])) continue;
      const d = v[i] - mean[i];
      stdDev[i] += d * d;
    }
  }
  for (let i = 0; i < dims; i++) stdDev[i] = Math.sqrt(stdDev[i] / (n[i] || 1));
  return { mean, stdDev };
}

function main() {
  assertWeightsAligned();

  const reportOnly = process.argv.includes('--report');

  const profiles: TradeProfile[] = JSON.parse(fs.readFileSync(PROFILES, 'utf8'));
  console.log(`Loaded ${profiles.length} trade profiles.`);

  const stats = computeStats(profiles);
  console.log('\nPer-feature corpus statistics:');
  FEATURE_NAMES.forEach((n, i) => {
    console.log(
      `  ${n.padEnd(17)} mean ${stats.mean[i].toFixed(3).padStart(9)}   sd ${stats.stdDev[i].toFixed(3).padStart(8)}   weight ${FEATURE_WEIGHTS[n]}`
    );
  });

  const zeroVariance = FEATURE_NAMES.filter((_, i) => !stats.stdDev[i]);
  if (zeroVariance.length) {
    console.log(`\n  ! zero variance, contributing nothing: ${zeroVariance.join(', ')}`);
  }

  // Precompute contexts once — gateContext is the expensive part.
  const contexts = profiles
    .map(p => {
      try {
        return gateContext(p);
      } catch {
        return null;
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // ── Reference distribution ────────────────────────────────────────
  //
  // NOT random pairs. Calibrating against random pairs is what made the first
  // attempt at this saturate at 96-100% on every proposal: the nearest of 1,570
  // candidates is, by construction, in the extreme left tail of the random-pair
  // distribution. Saying "closer than 99% of random pairs" is true of every
  // nearest neighbour ever returned, so it carries no information.
  //
  // The question a reader actually has is "is this a good comp *by the
  // standards of what comps look like*?" So the reference is the distribution
  // of nearest-neighbour distances: for every trade in the corpus, its own top
  // five, pooled. A candidate at the median of that distribution is as good a
  // comp as a typical trade's comps. Well below it means a genuinely close
  // precedent; well above means there isn't one.
  console.log(`\nBuilding nearest-neighbour reference from ${contexts.length} profiles (${TOP_K} each)...`);
  const distances: number[] = [];
  const byTierDistances = new Map<string, number[]>();
  for (let i = 0; i < contexts.length; i++) {
    const best: number[] = [];
    for (let j = 0; j < contexts.length; j++) {
      if (i === j) continue;
      if (!passesGate(contexts[i], contexts[j])) continue;
      const d = featureDistance(contexts[i], contexts[j], stats);
      if (!Number.isFinite(d)) continue;
      // Keep only the running top-K; the corpus is small enough that a full
      // sort per row would also work, but this keeps the pass linear in memory.
      if (best.length < TOP_K) {
        best.push(d);
        best.sort((a, b) => a - b);
      } else if (d < best[TOP_K - 1]) {
        best[TOP_K - 1] = d;
        best.sort((a, b) => a - b);
      }
    }
    distances.push(...best);
    const stratum = calibrationStratum(contexts[i].tier);
    if (!byTierDistances.has(stratum)) byTierDistances.set(stratum, []);
    byTierDistances.get(stratum)!.push(...best);
  }
  distances.sort((a, b) => a - b);

  const curve = (xs: number[]): number[] => {
    const out: number[] = [];
    for (let p = 0; p <= PERCENTILE_STEPS; p++) {
      out.push(xs[Math.floor((p / PERCENTILE_STEPS) * (xs.length - 1))]);
    }
    return out;
  };

  const quantiles = curve(distances);

  const byTier: CalibrationArtifact['byTier'] = {};
  console.log('\nPer-stratum reference curves:');
  for (const [tier, xs] of byTierDistances) {
    xs.sort((a, b) => a - b);
    byTier[tier] = { quantiles: curve(xs), sampleCount: xs.length };
    const usable = xs.length >= MIN_TIER_SAMPLES;
    console.log(
      `  ${tier.padEnd(10)} n=${String(xs.length).padStart(5)}  median ${curve(xs)[50].toFixed(3).padStart(7)}  ${usable ? '' : '(too sparse — falls back to pooled)'}`
    );
  }

  console.log(`\nNearest-neighbour distance distribution (${distances.length.toLocaleString()} neighbours):`);
  for (const p of [0, 1, 5, 10, 25, 50, 75, 90, 99, 100]) {
    console.log(`  p${String(p).padStart(3)}  ${quantiles[p].toFixed(3)}`);
  }

  // The gate: does a real proposal's top five actually spread, or does it
  // saturate the way v1 did? This is the number that decides whether the UI
  // may show a percentage at all.
  console.log('\nTop-5 absolute scores for 12 sampled proposals:');
  const sampleRand = mulberry32(0x1234567);
  let saturated = 0;
  const samples = 12;
  const spreads: number[] = [];
  for (let s = 0; s < samples; s++) {
    const idx = Math.floor(sampleRand() * contexts.length);
    const proposal = contexts[idx];
    const top = contexts
      .filter((c, i) => i !== idx && passesGate(proposal, c))
      .map(c => featureDistance(proposal, c, stats))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
      .slice(0, 5)
      .map(d => matchScoreFor(d, quantilesForTier({ quantiles, byTier }, proposal.tier)));
    if (top.length === 0) {
      console.log(`  ${(profiles[idx].headline ?? '').slice(0, 38).padEnd(40)} (nothing cleared the gate)`);
      continue;
    }
    const pcts = top.map(x => (100 * x).toFixed(0).padStart(3)).join(' ');
    if (top.every(x => x >= 0.99)) saturated++;
    spreads.push(top[0] - top[top.length - 1]);
    const label = (profiles[idx].headline ?? profiles[idx].id).slice(0, 38);
    console.log(`  ${label.padEnd(40)} [${pcts}]  ${proposal.tier.padEnd(9)} ${bandFor(top[0])}`);
  }
  const meanSpread = spreads.reduce((a, b) => a + b, 0) / (spreads.length || 1);
  console.log(`\n  saturated (all five >= 99%): ${saturated}/${samples}`);
  console.log(`  mean spread across a proposal's five cards: ${(100 * meanSpread).toFixed(1)} points`);
  if (saturated > samples / 3) {
    console.log('  ! Still saturating. Do not ship a percentage — use bands.');
  } else {
    console.log('  The scale spreads. A percentage is meaningful.');
  }

  if (reportOnly) {
    console.log('\n--report: no file written.');
    return;
  }

  const artifact: CalibrationArtifact = {
    version: ARTIFACT_VERSION,
    signature: calibrationSignature(
      FEATURE_NAMES as readonly string[],
      FEATURE_NAMES.map(n => FEATURE_WEIGHTS[n])
    ),
    generatedAt: new Date().toISOString(),
    tradeCount: contexts.length,
    pairCount: distances.length,
    stats,
    quantiles,
    byTier,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(artifact));
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_FILE} (${kb} KB, signature ${artifact.signature})`);
}

main();
