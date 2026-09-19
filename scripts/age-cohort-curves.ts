/**
 * Age-Cohort Performance Curves
 *
 * Builds age-indexed WS distributions from Kaggle's Advanced.csv:
 * given (current age, current WS), what's the expected future WS?
 *
 * Output:
 *   - public/data/age-cohort-curves.json — lookup table for comparables engine
 *   - Console: age-curve summary (median WS by age)
 *
 * Usage:
 *   npx tsx scripts/age-cohort-curves.ts                # Build + write JSON
 *   npx tsx scripts/age-cohort-curves.ts --dry-run      # Print summary, no write
 *   npx tsx scripts/age-cohort-curves.ts --since 1999   # Only seasons ending 1999+
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const CSV_PATH = path.join(__dirname, '..', 'data', 'kaggle', 'Advanced.csv');
const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'age-cohort-curves.json');

// ── Parse args ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceIdx = args.indexOf('--since');
const sinceSeason = sinceIdx >= 0 ? parseInt(args[sinceIdx + 1]) : 1976; // post-ABA-merger default

// ── Load CSV ─────────────────────────────────────────────────────────
type AdvancedRow = {
  season: string;        // end year, e.g., "2024"
  lg: string;
  player: string;
  player_id: string;
  age: string;
  team: string;
  ws: string;
  g: string;
};

console.log(`Parsing ${CSV_PATH}...`);
const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
const rows = parse(csvText, { columns: true, skip_empty_lines: true }) as AdvancedRow[];
console.log(`Parsed ${rows.length} rows.`);

// ── Dedupe to per-player-per-season totals ──────────────────────────
// Multi-team players have a 'TOT' row plus per-team rows. Keep TOT if present, else per-team.

type PlayerSeason = { player_id: string; season: number; age: number; ws: number; g: number };

const seasonMap = new Map<string, PlayerSeason>();

for (const r of rows) {
  if (r.lg !== 'NBA') continue; // exclude ABA/BAA
  const season = parseInt(r.season);
  if (isNaN(season) || season < sinceSeason) continue;
  const age = parseInt(r.age);
  const ws = parseFloat(r.ws);
  const g = parseInt(r.g);
  if (isNaN(age) || isNaN(ws)) continue;

  const key = `${r.player_id}|${season}`;
  const existing = seasonMap.get(key);

  if (r.team === 'TOT' || r.team === '2TM' || r.team === '3TM' || r.team === '4TM') {
    // Authoritative multi-team total — always take this
    seasonMap.set(key, { player_id: r.player_id, season, age, ws, g });
  } else if (!existing) {
    seasonMap.set(key, { player_id: r.player_id, season, age, ws, g });
  }
  // If existing is already TOT, skip per-team row
}

const seasons = Array.from(seasonMap.values());
console.log(`Distinct player-seasons: ${seasons.length}`);

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

// ── Bucket by (age, current WS) ──────────────────────────────────────
// WS buckets: -inf..0, 0..2, 2..4, 4..6, 6..8, 8..10, 10..12, 12..+inf
const WS_BUCKETS = [
  { label: 'negative',   min: -Infinity, max: 0 },
  { label: 'replacement', min: 0,         max: 2 },
  { label: 'rotation',    min: 2,         max: 4 },
  { label: 'starter',     min: 4,         max: 6 },
  { label: 'quality',     min: 6,         max: 8 },
  { label: 'allstar',     min: 8,         max: 10 },
  { label: 'allnba',      min: 10,        max: 12 },
  { label: 'mvp',         min: 12,        max: Infinity },
];

function wsBucket(ws: number): string {
  for (const b of WS_BUCKETS) {
    if (ws >= b.min && ws < b.max) return b.label;
  }
  return 'unknown';
}

// ── Compute cohort stats ─────────────────────────────────────────────
type CohortStats = {
  age: number;
  ws_bucket: string;
  n: number;
  median_current_ws: number;
  // Next-N-years cumulative WS distributions (median, p25, p75)
  next_1yr_median: number;
  next_3yr_median: number;
  next_5yr_median: number;
  next_1yr_p25: number;
  next_1yr_p75: number;
  next_3yr_p25: number;
  next_3yr_p75: number;
  // Bust & hit rates
  bust_rate_1yr: number;  // % with next-year WS < 1
  hit_rate_1yr: number;   // % with next-year WS >= current WS
};

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function median(arr: number[]): number {
  return percentile(arr, 0.5);
}

const cohortKey = (age: number, bucket: string) => `${age}|${bucket}`;
const cohorts = new Map<string, { current: number[]; next1: number[]; next3: number[]; next5: number[] }>();

for (const traj of trajectories.values()) {
  for (let i = 0; i < traj.length; i++) {
    const ps = traj[i];
    const bucket = wsBucket(ps.ws);
    const key = cohortKey(ps.age, bucket);

    // Cumulative WS over next 1, 3, 5 years (missing seasons count as 0 WS — player retired or out)
    const thisSeason = ps.season;
    let next1 = 0, next3 = 0, next5 = 0;
    for (let j = i + 1; j < traj.length; j++) {
      const gap = traj[j].season - thisSeason;
      if (gap <= 1) next1 += traj[j].ws;
      if (gap <= 3) next3 += traj[j].ws;
      if (gap <= 5) next5 += traj[j].ws;
      if (gap > 5) break;
    }

    if (!cohorts.has(key)) cohorts.set(key, { current: [], next1: [], next3: [], next5: [] });
    const c = cohorts.get(key)!;
    c.current.push(ps.ws);
    c.next1.push(next1);
    c.next3.push(next3);
    c.next5.push(next5);
  }
}

const cohortStats: CohortStats[] = [];
for (const [key, c] of cohorts.entries()) {
  const [ageStr, bucket] = key.split('|');
  const age = parseInt(ageStr);
  if (c.current.length < 5) continue; // skip cohorts with < 5 samples — noisy

  const cur = median(c.current);
  cohortStats.push({
    age,
    ws_bucket: bucket,
    n: c.current.length,
    median_current_ws: Math.round(cur * 10) / 10,
    next_1yr_median: Math.round(median(c.next1) * 10) / 10,
    next_3yr_median: Math.round(median(c.next3) * 10) / 10,
    next_5yr_median: Math.round(median(c.next5) * 10) / 10,
    next_1yr_p25: Math.round(percentile(c.next1, 0.25) * 10) / 10,
    next_1yr_p75: Math.round(percentile(c.next1, 0.75) * 10) / 10,
    next_3yr_p25: Math.round(percentile(c.next3, 0.25) * 10) / 10,
    next_3yr_p75: Math.round(percentile(c.next3, 0.75) * 10) / 10,
    bust_rate_1yr: Math.round(c.next1.filter(x => x < 1).length / c.next1.length * 1000) / 10,
    hit_rate_1yr: Math.round(c.next1.filter((x, i) => x >= c.current[i]).length / c.next1.length * 1000) / 10,
  });
}
cohortStats.sort((a, b) => a.age - b.age || a.ws_bucket.localeCompare(b.ws_bucket));

// ── Build age-aggregate curve (all WS buckets combined, per age) ───
type AgeSummary = { age: number; n: number; median_ws: number; p25_ws: number; p75_ws: number };
const ageAgg = new Map<number, number[]>();
for (const ps of seasons) {
  if (!ageAgg.has(ps.age)) ageAgg.set(ps.age, []);
  ageAgg.get(ps.age)!.push(ps.ws);
}
const ageSummary: AgeSummary[] = [];
for (const [age, wsList] of ageAgg.entries()) {
  if (wsList.length < 20) continue;
  ageSummary.push({
    age,
    n: wsList.length,
    median_ws: Math.round(median(wsList) * 10) / 10,
    p25_ws: Math.round(percentile(wsList, 0.25) * 10) / 10,
    p75_ws: Math.round(percentile(wsList, 0.75) * 10) / 10,
  });
}
ageSummary.sort((a, b) => a.age - b.age);

// ── Output summary ──────────────────────────────────────────────────
console.log('\nAge curve (all WS buckets, median/p25/p75):');
console.log('age | n     | median | p25  | p75');
console.log('----|-------|--------|------|-----');
for (const s of ageSummary) {
  console.log(`${String(s.age).padStart(3)} | ${String(s.n).padStart(5)} | ${String(s.median_ws).padStart(6)} | ${String(s.p25_ws).padStart(4)} | ${String(s.p75_ws).padStart(4)}`);
}

console.log(`\nCohort rows (age × WS bucket, n≥5): ${cohortStats.length}`);
console.log('\nSample cohorts (age 27, all buckets):');
for (const c of cohortStats.filter(c => c.age === 27)) {
  console.log(`  ${c.ws_bucket.padEnd(12)} n=${String(c.n).padStart(4)}  cur=${String(c.median_current_ws).padStart(5)}  next1yr=${String(c.next_1yr_median).padStart(5)} (p25=${c.next_1yr_p25}, p75=${c.next_1yr_p75})  next3yr=${c.next_3yr_median}  next5yr=${c.next_5yr_median}  bust=${c.bust_rate_1yr}%  hit=${c.hit_rate_1yr}%`);
}

// ── Write output ────────────────────────────────────────────────────
if (dryRun) {
  console.log('\n--dry-run: not writing output file.');
} else {
  const outDir = path.dirname(OUT_PATH);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    since_season: sinceSeason,
    total_player_seasons: seasons.length,
    total_players: trajectories.size,
    ws_buckets: WS_BUCKETS,
    age_summary: ageSummary,
    cohorts: cohortStats,
  }, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
}
