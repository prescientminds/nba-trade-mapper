/**
 * Build expected Win Shares by salary tier.
 *
 * Joins player_contracts with player_seasons to answer:
 *   "At each salary level, what WS do you expect?"
 *
 * Then identifies over/underperformers: players whose WS delta
 * from their salary tier's average is the largest.
 *
 * Usage:
 *   npx tsx scripts/salary-expectations.ts                    # Show tiers + top over/underperformers
 *   npx tsx scripts/salary-expectations.ts --tiers             # Just the salary tier table
 *   npx tsx scripts/salary-expectations.ts --overperformers 20 # Top 20 outperforming their salary
 *   npx tsx scripts/salary-expectations.ts --underperformers 20 # Worst 20 underperforming
 *   npx tsx scripts/salary-expectations.ts --since 2020        # Filter to recent seasons
 *   npx tsx scripts/salary-expectations.ts --cap-adjusted       # Salary as % of cap instead of raw $
 */

import { supabase } from './lib/supabase-admin';

// ── Types ────────────────────────────────────────────────────────────────

interface ContractSeason {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
}

interface PlayerSeason {
  player_name: string;
  team_id: string;
  season: string;
  win_shares: number | null;
}

interface CapRow {
  season: string;
  salary_cap: number;
}

interface JoinedRow {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
  cap_pct: number;
  win_shares: number;
}

interface SalaryTier {
  label: string;
  min: number;
  max: number;
  count: number;
  avgWs: number;
  medianWs: number;
  p25Ws: number;
  p75Ws: number;
  avgSalary: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// ── Salary tiers (raw $) ────────────────────────────────────────────────

const RAW_TIERS = [
  { label: 'Minimum ($0-2M)',     min: 0,          max: 2_000_000 },
  { label: 'Low ($2-5M)',         min: 2_000_000,  max: 5_000_000 },
  { label: 'Mid ($5-10M)',        min: 5_000_000,  max: 10_000_000 },
  { label: 'Solid ($10-15M)',     min: 10_000_000, max: 15_000_000 },
  { label: 'Starter ($15-20M)',   min: 15_000_000, max: 20_000_000 },
  { label: 'Above Avg ($20-25M)', min: 20_000_000, max: 25_000_000 },
  { label: 'All-Star ($25-30M)',  min: 25_000_000, max: 30_000_000 },
  { label: 'Star ($30-35M)',      min: 30_000_000, max: 35_000_000 },
  { label: 'Superstar ($35-40M)', min: 35_000_000, max: 40_000_000 },
  { label: 'Supermax ($40-45M)',  min: 40_000_000, max: 45_000_000 },
  { label: 'Mega ($45M+)',        min: 45_000_000, max: Infinity },
];

// ── Cap-% tiers ─────────────────────────────────────────────────────────

const CAP_TIERS = [
  { label: 'Minimum (0-3%)',     min: 0,    max: 0.03 },
  { label: 'Low (3-8%)',         min: 0.03, max: 0.08 },
  { label: 'Mid (8-13%)',        min: 0.08, max: 0.13 },
  { label: 'Solid (13-18%)',     min: 0.13, max: 0.18 },
  { label: 'Starter (18-22%)',   min: 0.18, max: 0.22 },
  { label: 'Above Avg (22-26%)', min: 0.22, max: 0.26 },
  { label: 'All-Star (26-30%)', min: 0.26, max: 0.30 },
  { label: 'Star (30-33%)',      min: 0.30, max: 0.33 },
  { label: 'Max (33-37%)',       min: 0.33, max: 0.37 },
  { label: 'Supermax (37%+)',    min: 0.37, max: Infinity },
];

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sinceArg = args.find(a => a.startsWith('--since'));
  const sinceYear = sinceArg ? parseInt(sinceArg.includes('=') ? sinceArg.split('=')[1] : args[args.indexOf(sinceArg) + 1]) : null;
  const seasonGte = sinceYear ? `${sinceYear}-${String(sinceYear + 1).slice(2)}` : null;

  const showTiersOnly = args.includes('--tiers');

  const overArg = args.find(a => a.startsWith('--overperformers'));
  const overN = overArg ? parseInt(overArg.includes('=') ? overArg.split('=')[1] : args[args.indexOf(overArg) + 1]) || 20 : (showTiersOnly ? 0 : 20);

  const underArg = args.find(a => a.startsWith('--underperformers'));
  const underN = underArg ? parseInt(underArg.includes('=') ? underArg.split('=')[1] : args[args.indexOf(underArg) + 1]) || 20 : (showTiersOnly ? 0 : 20);

  console.log('Loading data...');

  const [contracts, playerSeasons, capHistory] = await Promise.all([
    fetchAll<ContractSeason>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares'),
    fetchAll<CapRow>('salary_cap_history', 'season,salary_cap'),
  ]);

  console.log(`  Contracts: ${contracts.length}`);
  console.log(`  Player seasons: ${playerSeasons.length}`);
  console.log(`  Cap history: ${capHistory.length}`);

  // Build lookup: player+team+season → WS
  const wsLookup = new Map<string, number>();
  for (const ps of playerSeasons) {
    if (ps.win_shares === null) continue;
    const key = `${ps.player_name}|${ps.team_id}|${ps.season}`;
    if (!wsLookup.has(key) || (ps.win_shares > (wsLookup.get(key) || 0))) {
      wsLookup.set(key, ps.win_shares);
    }
  }

  // Build cap lookup
  const capBySeason = new Map<string, number>();
  for (const c of capHistory) capBySeason.set(c.season, c.salary_cap);

  // Join contracts with WS — always cap-adjusted (% of cap)
  const joined: JoinedRow[] = [];
  for (const c of contracts) {
    if (seasonGte && c.season < seasonGte) continue;
    const key = `${c.player_name}|${c.team_id}|${c.season}`;
    const ws = wsLookup.get(key);
    if (ws === undefined) continue;
    const cap = capBySeason.get(c.season) || 100_000_000;
    joined.push({
      player_name: c.player_name,
      team_id: c.team_id,
      season: c.season,
      salary: c.salary,
      cap_pct: c.salary / cap,
      win_shares: ws,
    });
  }

  console.log(`  Joined rows (contract + WS): ${joined.length}`);
  if (seasonGte) console.log(`  Filter: since ${seasonGte}`);

  // ═══════════════════════════════════════════════════════════════════════
  //  PER-SEASON BASELINES
  //  For each season, compute avg WS at each cap-% tier.
  //  Then each player-season's "expected WS" = their tier's avg THAT YEAR.
  // ═══════════════════════════════════════════════════════════════════════

  // Group joined rows by season
  const bySeason = new Map<string, JoinedRow[]>();
  for (const r of joined) {
    if (!bySeason.has(r.season)) bySeason.set(r.season, []);
    bySeason.get(r.season)!.push(r);
  }

  // For each season+tier, compute avgWS
  // Key: "season|tierIdx" → avgWS
  const seasonTierAvg = new Map<string, { avgWs: number; count: number }>();

  const allSeasons = [...bySeason.keys()].sort();
  for (const season of allSeasons) {
    const rows = bySeason.get(season)!;
    for (let ti = 0; ti < CAP_TIERS.length; ti++) {
      const td = CAP_TIERS[ti];
      const bucket = rows.filter(r => r.cap_pct >= td.min && r.cap_pct < td.max);
      if (bucket.length === 0) continue;
      const avg = bucket.reduce((s, r) => s + r.win_shares, 0) / bucket.length;
      seasonTierAvg.set(`${season}|${ti}`, { avgWs: Math.round(avg * 100) / 100, count: bucket.length });
    }
  }

  function getTierIdx(capPct: number): number {
    for (let i = 0; i < CAP_TIERS.length; i++) {
      if (capPct >= CAP_TIERS[i].min && capPct < CAP_TIERS[i].max) return i;
    }
    return CAP_TIERS.length - 1;
  }

  // Annotate each joined row with its per-season expected WS
  interface AnnotatedRow extends JoinedRow {
    tierIdx: number;
    tierLabel: string;
    expectedWs: number;
    delta: number; // actual - expected
  }

  const annotated: AnnotatedRow[] = [];
  for (const r of joined) {
    const ti = getTierIdx(r.cap_pct);
    const key = `${r.season}|${ti}`;
    const baseline = seasonTierAvg.get(key);
    if (!baseline) continue; // no peers in this tier this season
    annotated.push({
      ...r,
      tierIdx: ti,
      tierLabel: CAP_TIERS[ti].label,
      expectedWs: baseline.avgWs,
      delta: Math.round((r.win_shares - baseline.avgWs) * 100) / 100,
    });
  }

  // ── Print aggregated tier table (all-time, for reference) ─────────────

  console.log(`\n${'═'.repeat(95)}`);
  console.log(`  EXPECTED WIN SHARES BY SALARY TIER (cap-%, all seasons combined)`);
  console.log(`${'═'.repeat(95)}\n`);
  console.log(`  ${'Tier'.padEnd(24)} ${'N'.padStart(6)} ${'Avg WS'.padStart(8)} ${'Median'.padStart(8)} ${'P25'.padStart(6)} ${'P75'.padStart(6)} ${'Avg Cap%'.padStart(9)}`);
  console.log(`  ${'─'.repeat(24)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(9)}`);

  for (let ti = 0; ti < CAP_TIERS.length; ti++) {
    const td = CAP_TIERS[ti];
    const bucket = annotated.filter(r => r.tierIdx === ti);
    if (bucket.length === 0) continue;
    const wsList = bucket.map(r => r.win_shares).sort((a, b) => a - b);
    const avgWs = wsList.reduce((s, v) => s + v, 0) / wsList.length;
    const avgCap = bucket.reduce((s, r) => s + r.cap_pct, 0) / bucket.length;
    console.log(`  ${td.label.padEnd(24)} ${String(bucket.length).padStart(6)} ${avgWs.toFixed(1).padStart(8)} ${percentile(wsList, 50).toFixed(1).padStart(8)} ${percentile(wsList, 25).toFixed(1).padStart(6)} ${percentile(wsList, 75).toFixed(1).padStart(6)} ${(avgCap * 100).toFixed(1).padStart(8)}%`);
  }

  // ── Show how baselines vary by era ────────────────────────────────────

  // Group into eras for display
  const eras = [
    { label: '1984-1998', min: '1984', max: '1999' },
    { label: '1999-2005', min: '1999', max: '2006' },
    { label: '2005-2011', min: '2005', max: '2012' },
    { label: '2011-2017', min: '2011', max: '2018' },
    { label: '2017-2023', min: '2017', max: '2024' },
    { label: '2023-now',  min: '2023', max: '2099' },
  ];

  // Show top-tier (max/supermax) expected WS by era
  console.log(`\n${'═'.repeat(95)}`);
  console.log(`  MAX CONTRACT EXPECTED WS BY ERA (33%+ of cap, per-season baselines)`);
  console.log(`${'═'.repeat(95)}\n`);
  console.log(`  ${'Era'.padEnd(14)} ${'N'.padStart(5)} ${'Avg WS'.padStart(8)} ${'Median'.padStart(8)} ${'P25'.padStart(6)} ${'P75'.padStart(6)} ${'Avg Cap%'.padStart(9)}`);
  console.log(`  ${'─'.repeat(14)} ${'─'.repeat(5)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(9)}`);

  for (const era of eras) {
    const bucket = annotated.filter(r =>
      r.tierIdx >= 8 && // Max (33%+) or Supermax (37%+)
      r.season >= era.min && r.season < era.max
    );
    if (bucket.length === 0) continue;
    const wsList = bucket.map(r => r.win_shares).sort((a, b) => a - b);
    const avgWs = wsList.reduce((s, v) => s + v, 0) / wsList.length;
    const avgCap = bucket.reduce((s, r) => s + r.cap_pct, 0) / bucket.length;
    console.log(`  ${era.label.padEnd(14)} ${String(bucket.length).padStart(5)} ${avgWs.toFixed(1).padStart(8)} ${percentile(wsList, 50).toFixed(1).padStart(8)} ${percentile(wsList, 25).toFixed(1).padStart(6)} ${percentile(wsList, 75).toFixed(1).padStart(6)} ${(avgCap * 100).toFixed(1).padStart(8)}%`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  OVER/UNDERPERFORMERS using per-season baselines
  // ═══════════════════════════════════════════════════════════════════════

  interface PlayerAgg {
    player_name: string;
    team_id: string;
    seasons: number;
    avgSalary: number;
    avgCapPct: number;
    avgWs: number;
    totalWs: number;
    totalSalary: number;
    avgExpectedWs: number;  // avg of per-season expected WS
    avgDelta: number;       // avg of per-season deltas
    totalDelta: number;     // sum of per-season deltas
    dominantTier: string;
    seasonRange: string;
  }

  if (overN > 0 || underN > 0) {
    // Group by player+team
    const groups = new Map<string, AnnotatedRow[]>();
    for (const r of annotated) {
      const key = `${r.player_name}|${r.team_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    const aggs: PlayerAgg[] = [];
    for (const [, rows] of groups) {
      if (rows.length < 2) continue;

      const totalSalary = rows.reduce((s, r) => s + r.salary, 0);
      const totalWs = rows.reduce((s, r) => s + r.win_shares, 0);
      const totalDelta = rows.reduce((s, r) => s + r.delta, 0);
      const avgExpected = rows.reduce((s, r) => s + r.expectedWs, 0) / rows.length;
      const avgSalary = totalSalary / rows.length;
      const avgCapPct = rows.reduce((s, r) => s + r.cap_pct, 0) / rows.length;
      const avgWs = totalWs / rows.length;
      const avgDelta = totalDelta / rows.length;

      // Most common tier label
      const tierCounts = new Map<string, number>();
      for (const r of rows) tierCounts.set(r.tierLabel, (tierCounts.get(r.tierLabel) || 0) + 1);
      const dominantTier = [...tierCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

      const seasons = rows.map(r => r.season).sort();

      aggs.push({
        player_name: rows[0].player_name,
        team_id: rows[0].team_id,
        seasons: rows.length,
        avgSalary,
        avgCapPct,
        avgWs,
        totalWs,
        totalSalary,
        avgExpectedWs: Math.round(avgExpected * 100) / 100,
        avgDelta: Math.round(avgDelta * 100) / 100,
        totalDelta: Math.round(totalDelta * 100) / 100,
        dominantTier,
        seasonRange: `${seasons[0]}–${seasons[seasons.length - 1]}`,
      });
    }

    if (overN > 0) {
      const sorted = [...aggs].sort((a, b) => b.totalDelta - a.totalDelta);
      console.log(`\n${'═'.repeat(95)}`);
      console.log(`  TOP ${overN} OVERPERFORMERS (WS above same-year, same-tier peers)`);
      console.log(`${'═'.repeat(95)}\n`);

      for (const a of sorted.slice(0, overN)) {
        console.log(`  ${a.player_name} → ${a.team_id}  [${a.seasonRange}]  ${a.seasons} seasons`);
        console.log(`      Tier: ${a.dominantTier} (avg ${(a.avgCapPct * 100).toFixed(1)}% of cap)`);
        console.log(`      Expected: ${a.avgExpectedWs.toFixed(1)} WS/yr | Actual: ${a.avgWs.toFixed(1)} WS/yr | Delta: +${a.avgDelta.toFixed(1)}/yr (+${a.totalDelta.toFixed(1)} total)`);
        console.log();
      }
    }

    if (underN > 0) {
      const sorted = [...aggs].sort((a, b) => a.totalDelta - b.totalDelta);
      console.log(`\n${'═'.repeat(95)}`);
      console.log(`  TOP ${underN} UNDERPERFORMERS (WS below same-year, same-tier peers)`);
      console.log(`${'═'.repeat(95)}\n`);

      for (const a of sorted.slice(0, underN)) {
        console.log(`  ${a.player_name} → ${a.team_id}  [${a.seasonRange}]  ${a.seasons} seasons`);
        console.log(`      Tier: ${a.dominantTier} (avg ${(a.avgCapPct * 100).toFixed(1)}% of cap)`);
        console.log(`      Expected: ${a.avgExpectedWs.toFixed(1)} WS/yr | Actual: ${a.avgWs.toFixed(1)} WS/yr | Delta: ${a.avgDelta.toFixed(1)}/yr (${a.totalDelta.toFixed(1)} total)`);
        console.log();
      }
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
