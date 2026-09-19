/**
 * Young-Player Projection Curves
 *
 * Sister script to age-cohort-curves.ts. For players age ≤ 23, BPM predicts
 * future WS better than current WS does — low minutes mask talent. Buckets
 * young-player-seasons by (age, BPM tier) and projects forward 1/3/5-year WS.
 *
 * Output:
 *   - public/data/young-player-curves.json — lookup used by Trade Machine
 *     comparables + EV panels for rookies and sophomores.
 *
 * Usage:
 *   npx tsx scripts/young-player-curves.ts                  # age ≤ 23 default
 *   npx tsx scripts/young-player-curves.ts --dry-run
 *   npx tsx scripts/young-player-curves.ts --max-age 25 --since 1999
 *   npx tsx scripts/young-player-curves.ts --min-mp 1000    # require real sample
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.join(__dirname, '..', 'data', 'kaggle', 'Advanced.csv');
const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'young-player-curves.json');

// ── Parse args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const maxAge = parseIntArg('--max-age', 23);
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
// BPM for TOT row is minutes-weighted across stints — the correct single-season BPM.

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

const BBREF_SENTINEL = -999; // BBRef's -1000 sentinel for negligible minutes

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
  if (bpm < BBREF_SENTINEL) continue; // sentinel

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
console.log(`Distinct players: ${trajectories.size}`);

// ── BPM buckets tuned for young players ─────────────────────────────
// Rookie BPM distribution is heavily negative; these thresholds separate
// signal tiers meaningfully at the young end.
const BPM_BUCKETS = [
  { label: 'deep_negative', min: -Infinity, max: -4 },
  { label: 'poor',          min: -4,        max: -2 },
  { label: 'below_avg',     min: -2,        max: 0 },
  { label: 'average',       min: 0,         max: 2 },
  { label: 'above_avg',     min: 2,         max: 4 },
  { label: 'star_track',    min: 4,         max: 6 },
  { label: 'elite_track',   min: 6,         max: Infinity },
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
  next_3yr_ws_median: number;
  next_5yr_ws_median: number;
  next_1yr_ws_p25: number;
  next_1yr_ws_p75: number;
  next_3yr_ws_p25: number;
  next_3yr_ws_p75: number;
  breakout_rate_3yr: number;   // % whose 3yr median WS ≥ 6 (starter-plus)
  bust_rate_3yr: number;       // % whose 3yr cumulative WS < 3
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
  next3: number[];
  next5: number[];
};
const cohorts = new Map<string, Cohort>();

for (const traj of trajectories.values()) {
  for (let i = 0; i < traj.length; i++) {
    const ps = traj[i];
    if (ps.age > maxAge) continue;
    if (ps.mp < minMp) continue;

    const bucket = bpmBucket(ps.bpm);
    const key = cohortKey(ps.age, bucket);

    const thisSeason = ps.season;
    let next1 = 0, next3 = 0, next5 = 0;
    for (let j = i + 1; j < traj.length; j++) {
      const gap = traj[j].season - thisSeason;
      if (gap <= 1) next1 += traj[j].ws;
      if (gap <= 3) next3 += traj[j].ws;
      if (gap <= 5) next5 += traj[j].ws;
      if (gap > 5) break;
    }

    if (!cohorts.has(key)) {
      cohorts.set(key, { currentWs: [], currentBpm: [], currentMp: [], next1: [], next3: [], next5: [] });
    }
    const c = cohorts.get(key)!;
    c.currentWs.push(ps.ws);
    c.currentBpm.push(ps.bpm);
    c.currentMp.push(ps.mp);
    c.next1.push(next1);
    c.next3.push(next3);
    c.next5.push(next5);
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
    next_3yr_ws_median: round1(median(c.next3)),
    next_5yr_ws_median: round1(median(c.next5)),
    next_1yr_ws_p25: round1(percentile(c.next1, 0.25)),
    next_1yr_ws_p75: round1(percentile(c.next1, 0.75)),
    next_3yr_ws_p25: round1(percentile(c.next3, 0.25)),
    next_3yr_ws_p75: round1(percentile(c.next3, 0.75)),
    breakout_rate_3yr: Math.round(c.next3.filter(x => x >= 18).length / c.next3.length * 1000) / 10,
    bust_rate_3yr: Math.round(c.next3.filter(x => x < 3).length / c.next3.length * 1000) / 10,
  });
}
cohortStats.sort((a, b) => a.age - b.age || BPM_BUCKETS.findIndex(x => x.label === a.bpm_bucket) - BPM_BUCKETS.findIndex(x => x.label === b.bpm_bucket));

// ── Output summary ──────────────────────────────────────────────────
console.log(`\nYoung-player cohorts (age ≤ ${maxAge}, MP ≥ ${minMp}, since ${sinceSeason}):`);
console.log(`Total cohort rows: ${cohortStats.length}`);
console.log('\nage | bpm_bucket       | n    | cur_bpm | cur_ws | cur_mp | 3yr_med | 3yr_p25 | 3yr_p75 | breakout% | bust%');
console.log('----|------------------|------|---------|--------|--------|---------|---------|---------|-----------|------');
for (const c of cohortStats) {
  console.log(
    `${String(c.age).padStart(3)} | ${c.bpm_bucket.padEnd(16)} | ${String(c.n).padStart(4)} | ` +
    `${String(c.median_current_bpm).padStart(7)} | ${String(c.median_current_ws).padStart(6)} | ` +
    `${String(c.median_current_mp).padStart(6)} | ${String(c.next_3yr_ws_median).padStart(7)} | ` +
    `${String(c.next_3yr_ws_p25).padStart(7)} | ${String(c.next_3yr_ws_p75).padStart(7)} | ` +
    `${String(c.breakout_rate_3yr).padStart(8)}% | ${String(c.bust_rate_3yr).padStart(4)}%`
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
    methodology: 'Young-player (age ≤ max_age) seasons bucketed by (age, BPM tier). Projects forward cumulative WS at 1/3/5-year horizons. Minutes floor avoids tiny-sample garbage-time rookies.',
    max_age: maxAge,
    since_season: sinceSeason,
    min_mp: minMp,
    total_cohort_player_seasons: Array.from(cohorts.values()).reduce((s, c) => s + c.currentWs.length, 0),
    total_players: trajectories.size,
    bpm_buckets: BPM_BUCKETS,
    cohorts: cohortStats,
  }, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}
