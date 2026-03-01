/**
 * Bobby Marks Engine: Validate all trades for salary cap legality.
 *
 * For each trade, looks up player salaries and salary cap thresholds,
 * then checks whether the trade's salary matching complies with the
 * CBA rules that were in effect at the time.
 *
 * Reads:   public/data/trades/by-season/*.json, player_contracts, salary_cap_history
 * Reports: Summary of legal/illegal/incomplete trades
 *
 * Usage:
 *   npx tsx scripts/validate-trade-salaries.ts                     # Validate all trades
 *   npx tsx scripts/validate-trade-salaries.ts --season 2023-24    # Single season
 *   npx tsx scripts/validate-trade-salaries.ts --illegal           # Only show illegal trades
 *   npx tsx scripts/validate-trade-salaries.ts --top 20            # Show top 20 most over-the-limit
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import {
  validateTrade,
  getCBAEra,
  type TradeAssetWithSalary,
  type CapThresholds,
  type TradeValidationResult,
} from '../src/lib/trade-validation';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

// ── Types ────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: {
    type: 'player' | 'pick' | 'swap' | 'cash';
    player_name: string | null;
    from_team_id: string;
    to_team_id: string;
    pick_year: number | null;
    pick_round: number | null;
    became_player_name: string | null;
  }[];
}

interface ContractRow {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
}

interface CapRow {
  season: string;
  salary_cap: number;
  luxury_tax: number | null;
  first_apron: number | null;
  second_apron: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const showIllegalOnly = args.includes('--illegal');
  const seasonArg = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;

  console.log('Loading data...');

  const [contracts, capHistory] = await Promise.all([
    fetchAll<ContractRow>('player_contracts', 'player_name,team_id,season,salary'),
    fetchAll<CapRow>('salary_cap_history', 'season,salary_cap,luxury_tax,first_apron,second_apron'),
  ]);

  console.log(`  player_contracts: ${contracts.length} rows`);
  console.log(`  salary_cap_history: ${capHistory.length} rows`);

  // Build salary lookup: "playerName|season" → salary
  // Use the player's salary for their team in that season
  const salaryMap = new Map<string, number>();
  for (const c of contracts) {
    const key = `${c.player_name}|${c.season}`;
    // If a player has multiple contracts in a season (mid-season trade),
    // use the higher one (typically the one at trade time)
    const existing = salaryMap.get(key);
    if (!existing || c.salary > existing) {
      salaryMap.set(key, c.salary);
    }
  }

  // Build cap thresholds by season
  const capBySeason = new Map<string, CapThresholds>();
  for (const c of capHistory) {
    capBySeason.set(c.season, {
      salary_cap: c.salary_cap,
      luxury_tax: c.luxury_tax,
      first_apron: c.first_apron,
      second_apron: c.second_apron,
    });
  }

  // Load trades
  const seasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .filter(f => !singleSeason || f === `${singleSeason}.json`)
    .sort();

  const allTrades: Trade[] = [];
  for (const file of seasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} trades from ${seasonFiles.length} files.\n`);

  // Validate each trade
  const results: TradeValidationResult[] = [];

  for (const trade of allTrades) {
    const cap = capBySeason.get(trade.season);
    if (!cap) continue;  // No cap data for this season

    // Only validate trades with player assets
    const playerAssets = trade.assets.filter(a => a.type === 'player' && a.player_name);
    if (playerAssets.length === 0) continue;  // Picks-only trade — no salary matching needed

    // Build assets with salary data
    const assetsWithSalary: TradeAssetWithSalary[] = trade.assets.map(a => ({
      type: a.type,
      player_name: a.player_name,
      from_team_id: a.from_team_id,
      to_team_id: a.to_team_id,
      salary: a.player_name ? (salaryMap.get(`${a.player_name}|${trade.season}`) ?? null) : null,
    }));

    const result = validateTrade(trade.id, trade.date, trade.season, assetsWithSalary, cap);
    results.push(result);
  }

  // ── Summary statistics ────────────────────────────────────────────

  const legal = results.filter(r => r.isLegal && !r.hasIncompleteData);
  const illegal = results.filter(r => !r.isLegal && !r.hasIncompleteData);
  const incomplete = results.filter(r => r.hasIncompleteData);
  const totalValidated = results.length;

  console.log(`Validated ${totalValidated} trades with player assets.`);
  console.log(`  Legal (salary matching works):   ${legal.length} (${Math.round(legal.length / totalValidated * 100)}%)`);
  console.log(`  Illegal (may use cap room/TPE):  ${illegal.length} (${Math.round(illegal.length / totalValidated * 100)}%)`);
  console.log(`  Incomplete (missing salary data): ${incomplete.length} (${Math.round(incomplete.length / totalValidated * 100)}%)`);

  // CBA era breakdown
  const byEra = new Map<string, { total: number; legal: number; illegal: number; incomplete: number }>();
  for (const r of results) {
    const era = r.cbaEra;
    if (!byEra.has(era)) byEra.set(era, { total: 0, legal: 0, illegal: 0, incomplete: 0 });
    const e = byEra.get(era)!;
    e.total++;
    if (r.hasIncompleteData) e.incomplete++;
    else if (r.isLegal) e.legal++;
    else e.illegal++;
  }

  console.log('\nBy CBA era:');
  for (const [era, stats] of [...byEra.entries()].sort()) {
    console.log(`  ${era} CBA: ${stats.total} trades — ${stats.legal} legal, ${stats.illegal} flagged, ${stats.incomplete} incomplete`);
  }

  // ── Detail output ─────────────────────────────────────────────────

  const printResults = showIllegalOnly ? illegal : results.filter(r => !r.isLegal && !r.hasIncompleteData);

  // Sort by how far over the limit the trade is
  const sortedIllegal = [...printResults].sort((a, b) => {
    const aOverage = Math.max(...a.teams.map(t => t.incomingSalary - t.maxAllowedIncoming));
    const bOverage = Math.max(...b.teams.map(t => t.incomingSalary - t.maxAllowedIncoming));
    return bOverage - aOverage;
  });

  const printCount = topN || (sortedIllegal.length > 30 ? 30 : sortedIllegal.length);

  if (printCount > 0 && sortedIllegal.length > 0) {
    console.log(`\nTop ${printCount} trades that don't match standard over-the-cap rules:`);
    console.log('(These likely involved cap room, trade exceptions, or sign-and-trades)\n');

    for (const r of sortedIllegal.slice(0, printCount)) {
      console.log(`  [${r.season}] ${r.tradeDate}  ${r.cbaEra} CBA`);
      for (const t of r.teams) {
        if (t.outgoingPlayers.length === 0 && t.incomingPlayers.length === 0) continue;
        const status = t.isLegal ? 'OK' : 'OVER';
        const overage = t.incomingSalary - t.maxAllowedIncoming;
        const overageStr = overage > 0 ? ` [+$${(overage / 1e6).toFixed(1)}M over limit]` : '';
        console.log(`    ${t.teamId}: sends $${(t.outgoingSalary / 1e6).toFixed(1)}M, receives $${(t.incomingSalary / 1e6).toFixed(1)}M → max allowed $${(t.maxAllowedIncoming / 1e6).toFixed(1)}M ${status}${overageStr}`);
        if (t.outgoingPlayers.length > 0) {
          const names = t.outgoingPlayers.map(p => `${p.name} ($${(p.salary / 1e6).toFixed(1)}M)`).join(', ');
          console.log(`      OUT: ${names}`);
        }
        if (t.incomingPlayers.length > 0) {
          const names = t.incomingPlayers.map(p => `${p.name} ($${(p.salary / 1e6).toFixed(1)}M)`).join(', ');
          console.log(`      IN:  ${names}`);
        }
      }
    }
  }

  console.log('\nNote: "Illegal" trades typically used cap room, traded player exceptions (TPEs),');
  console.log('or sign-and-trade provisions — all legal mechanisms not captured in basic matching.');
}

main().catch(console.error);
