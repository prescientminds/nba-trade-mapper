/**
 * Veteran Projection Curves (age ≥ 34)
 *
 * Sister script to young-player-curves.ts. For aging players, the relevant
 * forward question is "how much does this guy have left" — injury cliff and
 * production decay dominate. Buckets veteran-player-seasons by (age, BPM tier)
 * and projects forward 1/2/3-year WS plus a cliff rate (fraction dropping
 * below 500 MP the next year).
 *
 * Output:
 *   - public/data/veteran-curves.json — lookup used by Trade Machine
 *     when evaluating trades for 34+ stars (KD/LeBron/CP3/Klay/PG-type deals).
 *
 * Usage:
 *   npx tsx scripts/veteran-curves.ts                    # age ≥ 34 default
 *   npx tsx scripts/veteran-curves.ts --dry-run
 *   npx tsx scripts/veteran-curves.ts --min-age 33
 *   npx tsx scripts/veteran-curves.ts --min-mp 1000
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.join(__dirname, '..', 'data', 'kaggle', 'Advanced.csv');
const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'veteran-curves.json');

// ── Parse args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const minAge = parseIntArg('--min-age', 34);
const sinceSeason = parseIntArg('--since', 1976);
const minMp = parseIntArg('--min-mp', 500);

function parseIntArg(flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  if (idx < 0) return fallback;
  const n = parseInt(args[idx + 1]);
  return isNaN(n) ? fallback : n;
}

// ── Load CSV ─────────────────────────────────────────────────────────
type AdvancedRow = {
  season: string;
  lg: string;
  player: string;
  player_id: string;
  age: string;
  team: string;
  g: string;
  mp: string;
  ws: string;
  bpm: string;
};

console.log(`Parsing ${CSV_PATH}...`);
const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parse(csvText, { columns: true, skip_empty_lines: true }) as AdvancedRow[];
console.log(`Parsed ${rows.length} rows.`);

// ── Dedupe to per-player-per-season totals (TOT-preferred) ──────────
type PlayerSeason = {
  player_id: string;
  season: number;
  age: number;
  ws: number;
  bpm: number;
  mp: number;
  g: number;
};

const seasonMap = new Map<string, PlayerSeason>();
const BBREF_SENTINEL = -999;

for (const r of rows) {
  if (r.lg !== 'NBA') continue;
  const season = parseInt(r.season);
  if (isNaN(season) || season < sinceSeason) continue;
  const age = parseInt(r.age);
  const ws = parseFloat(r.ws);
  const bpm = parseFloat(r.bpm);
  const mp = parseInt(r.mp);
  const g = parseInt(r.g);
  if (isNaN(age) || isNaN(ws) || isNaN(bpm) || isNaN(mp)) continue;
  if (bpm < BBREF_SENTINEL) continue;

  const key = `${r.player_id}|${season}`;
  const existing = seasonMap.get(key);

  if (r.team === 'TOT' || r.team === '2TM' || r.team === '3TM' || r.team === '4TM') {
    seasonMap.set(key, { player_id: r.player_id, season, age, ws, bpm, mp, g });
  } else if (!existing) {
    seasonMap.set(key, { player_id: r.player_id, season, age, ws, bpm, mp, g });
  }
}

const seasons = Array.from(seasonMap.values());
console.log(`Distinct player-seasons (all ages): ${seasons.length}`);

// ── Build per-player trajectories ───────────────────────────────────
const trajectories = new Map<string, PlayerSeason[]>();
for (const ps of seasons) {
  if (!trajectories.has(ps.player_id)) trajectories.set(ps.player_id, []);
  trajectories.get(ps.player_id)!.push(ps);
}
for (const traj of trajectories.values()) {
  traj.sort((a, b) => a.season - b.season);
}

// ── BPM buckets tuned for veterans ──────────────────────────────────
// Veteran BPM compresses — by 34+, even star-level players rarely sustain
// 6+ BPM; bucket grid reflects that realistic upper range.
const BPM_BUCKETS = [
  { label: 'replacement',   min: -Infinity, max: -3 },
  { label: 'bench_neg',     min: -3,        max: -1 },
  { label: 'rotation',      min: -1,        max: 1 },
  { label: 'quality_vet',   min: 1,         max: 3 },
  { label: 'star_vet',      min: 3,         max: 5 },
  { label: 'elite_vet',     min: 5,         max: Infinity },
];

function bpmBucket(bpm: number): string {
  for (const b of BPM_BUCKETS) {
    if (bpm >= b.min && bpm < b.max) return b.label;
  }
  return 'unknown';
}

// ── Compute cohort stats ─────────────────────────────────────────────
type CohortStats = {
  age: number;
  bpm_bucket: string;
  n: number;
  median_current_bpm: number;
  median_current_ws: number;
  median_current_mp: number;
  next_1yr_ws_median: number;
  next_2yr_ws_median: number;
  next_3yr_ws_median: number;
  next_1yr_ws_p25: number;
  next_1yr_ws_p75: number;
  next_3yr_ws_p25: number;
  next_3yr_ws_p75: number;
  // Veteran-specific risk metrics
  cliff_rate_1yr: number;       // % whose next season was <500 MP OR absent (retired/injury)
  holds_rate_1yr: number;       // % whose next-year BPM held within 1.0 of current
  still_producing_3yr: number;  // % with 3yr cumulative WS ≥ 5
};

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const median = (arr: number[]) => percentile(arr, 0.5);
const round1 = (n: number) => Math.round(n * 10) / 10;

const cohortKey = (age: number, bucket: string) => `${age}|${bucket}`;
type Cohort = {
  currentWs: number[];
  currentBpm: number[];
  currentMp: number[];
  next1: number[];
  next2: number[];
  next3: number[];
  cliffed: boolean[];
  heldBpm: boolean[];
};
const cohorts = new Map<string, Cohort>();

for (const traj of trajectories.values()) {
  for (let i = 0; i < traj.length; i++) {
    const ps = traj[i];
    if (ps.age < minAge) continue;
    if (ps.mp < minMp) continue;

    const bucket = bpmBucket(ps.bpm);
    const key = cohortKey(ps.age, bucket);

    const thisSeason = ps.season;
    let next1 = 0, next2 = 0, next3 = 0;
    let nextSeasonMp = 0;
    let nextSeasonBpm: number | null = null;
    let foundNextSeason = false;

    for (let j = i + 1; j < traj.length; j++) {
      const gap = traj[j].season - thisSeason;
      if (gap === 1) {
        nextSeasonMp = traj[j].mp;
        nextSeasonBpm = traj[j].bpm;
        foundNextSeason = true;
      }
      if (gap <= 1) next1 += traj[j].ws;
      if (gap <= 2) next2 += traj[j].ws;
      if (gap <= 3) next3 += traj[j].ws;
      if (gap > 3) break;
    }

    // Cliff = next year absent OR below 500 MP
    const cliffed = !foundNextSeason || nextSeasonMp < 500;
    // Held = played ≥ 500 MP next year AND BPM within 1.0 of current
    const heldBpm = foundNextSeason && nextSeasonMp >= 500 && nextSeasonBpm !== null &&
                    Math.abs(nextSeasonBpm - ps.bpm) <= 1.0;

    if (!cohorts.has(key)) {
      cohorts.set(key, {
        currentWs: [], currentBpm: [], currentMp: [],
        next1: [], next2: [], next3: [],
        cliffed: [], heldBpm: [],
      });
    }
    const c = cohorts.get(key)!;
    c.currentWs.push(ps.ws);
    c.currentBpm.push(ps.bpm);
    c.currentMp.push(ps.mp);
    c.next1.push(next1);
    c.next2.push(next2);
    c.next3.push(next3);
    c.cliffed.push(cliffed);
    c.heldBpm.push(heldBpm);
  }
}

const cohortStats: CohortStats[] = [];
for (const [key, c] of cohorts.entries()) {
  const [ageStr, bucket] = key.split('|');
  const age = parseInt(ageStr);
  if (c.currentWs.length < 5) continue;

  cohortStats.push({
    age,
    bpm_bucket: bucket,
    n: c.currentWs.length,
    median_current_bpm: round1(median(c.currentBpm)),
    median_current_ws: round1(median(c.currentWs)),
    median_current_mp: Math.round(median(c.currentMp)),
    next_1yr_ws_median: round1(median(c.next1)),
    next_2yr_ws_median: round1(median(c.next2)),
    next_3yr_ws_median: round1(median(c.next3)),
    next_1yr_ws_p25: round1(percentile(c.next1, 0.25)),
    next_1yr_ws_p75: round1(percentile(c.next1, 0.75)),
    next_3yr_ws_p25: round1(percentile(c.next3, 0.25)),
    next_3yr_ws_p75: round1(percentile(c.next3, 0.75)),
    cliff_rate_1yr: Math.round(c.cliffed.filter(x => x).length / c.cliffed.length * 1000) / 10,
    holds_rate_1yr: Math.round(c.heldBpm.filter(x => x).length / c.heldBpm.length * 1000) / 10,
    still_producing_3yr: Math.round(c.next3.filter(x => x >= 5).length / c.next3.length * 1000) / 10,
  });
}
cohortStats.sort((a, b) => a.age - b.age || BPM_BUCKETS.findIndex(x => x.label === a.bpm_bucket) - BPM_BUCKETS.findIndex(x => x.label === b.bpm_bucket));

// ── Output summary ──────────────────────────────────────────────────
console.log(`\nVeteran cohorts (age ≥ ${minAge}, MP ≥ ${minMp}, since ${sinceSeason}):`);
console.log(`Total cohort rows: ${cohortStats.length}`);
console.log('\nage | bpm_bucket    | n    | cur_bpm | cur_ws | cur_mp | 1yr_med | 3yr_med | 3yr_p75 | cliff% | holds% | still_producing_3yr%');
console.log('----|---------------|------|---------|--------|--------|---------|---------|---------|--------|--------|--------------------');
for (const c of cohortStats) {
  console.log(
    `${String(c.age).padStart(3)} | ${c.bpm_bucket.padEnd(13)} | ${String(c.n).padStart(4)} | ` +
    `${String(c.median_current_bpm).padStart(7)} | ${String(c.median_current_ws).padStart(6)} | ` +
    `${String(c.median_current_mp).padStart(6)} | ${String(c.next_1yr_ws_median).padStart(7)} | ` +
    `${String(c.next_3yr_ws_median).padStart(7)} | ${String(c.next_3yr_ws_p75).padStart(7)} | ` +
    `${String(c.cliff_rate_1yr).padStart(5)}% | ${String(c.holds_rate_1yr).padStart(5)}% | ` +
    `${String(c.still_producing_3yr).padStart(17)}%`
  );
}

// ── Write output ────────────────────────────────────────────────────
if (dryRun) {
  console.log('\n--dry-run: not writing output file.');
} else {
  const outDir = path.dirname(OUT_PATH);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    methodology: 'Veteran (age ≥ min_age) seasons bucketed by (age, BPM tier). Projects forward WS 1/2/3-year, plus cliff rate (% of cohort dropping below 500 MP or absent next year) and holds rate (% sustaining BPM within 1.0). Minutes floor avoids end-of-bench noise.',
    min_age: minAge,
    since_season: sinceSeason,
    min_mp: minMp,
    total_cohort_player_seasons: Array.from(cohorts.values()).reduce((s, c) => s + c.currentWs.length, 0),
    bpm_buckets: BPM_BUCKETS,
    cohorts: cohortStats,
  }, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}
