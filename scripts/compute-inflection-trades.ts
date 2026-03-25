/**
 * Compute Inflection Trades — team trajectory before/after each trade.
 *
 * For each trade, for each team involved:
 *   - Average wins in the 3 seasons before the trade
 *   - Average wins in the 3 seasons after the trade
 *   - Delta = after - before
 *
 * "Inflection swing" = max divergence between any two teams in the trade.
 * E.g., Team A goes +12 wins while Team B goes -10 wins → swing = 22.
 *
 * Reads:   public/data/trades/by-season/*.json, team_seasons (W/L)
 * Updates: trade_scores table (inflection_swing, inflection_teams columns)
 *
 * PREREQUISITE: Run database/migrations/016-discovery-v2.sql first.
 *
 * Usage:
 *   npx tsx scripts/compute-inflection-trades.ts              # Compute all
 *   npx tsx scripts/compute-inflection-trades.ts --dry-run    # Print top results, no DB writes
 *   npx tsx scripts/compute-inflection-trades.ts --top 20     # Print top 20
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const WINDOW = 3; // seasons before/after

// ── Types ──

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: { type: string; from_team_id: string; to_team_id: string }[];
}

interface TeamSeason {
  team_id: string;
  season: string;
  wins: number;
  losses: number;
}

interface TeamInflection {
  before: number;
  after: number;
  delta: number;
}

// ── Helpers ──

function r2(n: number): number { return Math.round(n * 100) / 100; }

function seasonToYear(season: string): number {
  // "2003-04" → 2003
  return parseInt(season.split('-')[0], 10);
}

function yearToSeason(year: number): string {
  return `${year}-${String(year + 1).slice(2)}`;
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;

  console.log('Computing Inflection Trades...\n');

  // Load team_seasons from Supabase
  console.log('Loading team_seasons...');
  const teamSeasons: TeamSeason[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('team_seasons')
      .select('team_id, season, wins, losses')
      .range(from, from + 999);
    if (error) throw new Error(`Failed: ${error.message}`);
    if (!data || data.length === 0) break;
    teamSeasons.push(...(data as TeamSeason[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  ${teamSeasons.length} team-season records.`);

  // Index: team_id → year → wins
  const winsByTeamYear = new Map<string, Map<number, number>>();
  for (const ts of teamSeasons) {
    const year = seasonToYear(ts.season);
    if (!winsByTeamYear.has(ts.team_id)) winsByTeamYear.set(ts.team_id, new Map());
    winsByTeamYear.get(ts.team_id)!.set(year, ts.wins);
  }

  // Load all trades
  const allSeasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .sort();

  const allTrades: Trade[] = [];
  for (const file of allSeasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`  ${allTrades.length} trades loaded.\n`);

  // Compute inflection for each trade
  interface Result {
    trade_id: string;
    swing: number;
    teams: Record<string, TeamInflection>;
  }

  const results: Result[] = [];

  for (const trade of allTrades) {
    const tradeYear = seasonToYear(trade.season);

    // Get all teams involved
    const teamIds = new Set<string>();
    for (const asset of trade.assets) {
      if (asset.from_team_id) teamIds.add(asset.from_team_id);
      if (asset.to_team_id) teamIds.add(asset.to_team_id);
    }

    const teamInflections: Record<string, TeamInflection> = {};

    for (const teamId of teamIds) {
      const teamWins = winsByTeamYear.get(teamId);
      if (!teamWins) continue;

      // 3 seasons before: tradeYear-3, tradeYear-2, tradeYear-1
      const beforeYears: number[] = [];
      for (let y = tradeYear - WINDOW; y < tradeYear; y++) {
        if (teamWins.has(y)) beforeYears.push(teamWins.get(y)!);
      }

      // 3 seasons after: tradeYear+1, tradeYear+2, tradeYear+3
      // (tradeYear itself is excluded — the trade happened mid-season)
      const afterYears: number[] = [];
      for (let y = tradeYear + 1; y <= tradeYear + WINDOW; y++) {
        if (teamWins.has(y)) afterYears.push(teamWins.get(y)!);
      }

      // Need at least 2 seasons on each side for meaningful comparison
      if (beforeYears.length < 2 || afterYears.length < 2) continue;

      const before = r2(beforeYears.reduce((a, b) => a + b, 0) / beforeYears.length);
      const after = r2(afterYears.reduce((a, b) => a + b, 0) / afterYears.length);
      const delta = r2(after - before);

      teamInflections[teamId] = { before, after, delta };
    }

    // Compute swing: max divergence between any two teams
    const deltas = Object.values(teamInflections).map(t => t.delta);
    if (deltas.length < 2) {
      results.push({ trade_id: trade.id, swing: 0, teams: teamInflections });
      continue;
    }

    const maxDelta = Math.max(...deltas);
    const minDelta = Math.min(...deltas);
    const swing = r2(maxDelta - minDelta);

    results.push({ trade_id: trade.id, swing, teams: teamInflections });
  }

  results.sort((a, b) => b.swing - a.swing);

  console.log(`Computed ${results.length} trades.`);
  console.log(`  Swing > 20: ${results.filter(r => r.swing > 20).length}`);
  console.log(`  Swing > 15: ${results.filter(r => r.swing > 15).length}`);
  console.log(`  Swing > 10: ${results.filter(r => r.swing > 10).length}\n`);

  // Print top N
  const printCount = topN || (dryRun ? 25 : 0);
  if (printCount > 0) {
    console.log(`Top ${printCount} Inflection Trades:\n`);
    for (let i = 0; i < Math.min(printCount, results.length); i++) {
      const r = results[i];
      const trade = allTrades.find(t => t.id === r.trade_id)!;
      console.log(`#${i + 1}  [${trade.season}] ${trade.title || trade.id.slice(-12)}  — swing: ${r.swing.toFixed(1)}`);
      for (const [teamId, inf] of Object.entries(r.teams)) {
        const arrow = inf.delta >= 0 ? '+' : '';
        console.log(`    ${teamId}: ${inf.before.toFixed(1)} → ${inf.after.toFixed(1)} (${arrow}${inf.delta.toFixed(1)})`);
      }
      console.log('');
    }
  }

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  // Upsert to trade_scores
  console.log('Updating trade_scores...');
  const BATCH = 200;
  let updated = 0, errors = 0;

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH);
    for (const r of batch) {
      const { error } = await supabase
        .from('trade_scores')
        .update({
          inflection_swing: r.swing,
          inflection_teams: r.teams,
        })
        .eq('trade_id', r.trade_id);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }
    if ((i + BATCH) % 500 === 0) process.stdout.write(`  ${Math.min(i + BATCH, results.length)}/${results.length}...\n`);
  }

  console.log(`Done! Updated ${updated} rows (${errors} errors).`);
}

main().catch(console.error);
