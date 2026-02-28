/**
 * Audit: Find player name mismatches between trade JSON files and player_contracts table.
 *
 * For trades from 1990-91 onward (salary data era), identifies trades where:
 *   - Player assets don't match any name in player_contracts
 *   - Pick assets with became_player_name don't match any name in player_contracts
 *
 * For each unmatched name, performs fuzzy matching by last name to find near-matches.
 *
 * READ-ONLY — does not write to the database.
 *
 * Usage: npx tsx scripts/audit-salary-names.ts
 */

import { supabase } from './lib/supabase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TradeAsset {
  type: 'player' | 'pick' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: TradeAsset[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function seasonStartYear(season: string): number {
  // "1990-91" → 1990
  return parseInt(season.split('-')[0], 10);
}

function extractLastName(fullName: string): string {
  // Handle suffixes like Jr., III, II, Sr., IV
  const parts = fullName.trim().split(/\s+/);
  const suffixes = new Set(['jr.', 'jr', 'sr.', 'sr', 'ii', 'iii', 'iv', 'v']);
  // Walk backward past suffixes
  let idx = parts.length - 1;
  while (idx > 0 && suffixes.has(parts[idx].toLowerCase())) {
    idx--;
  }
  return parts[idx].toLowerCase();
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== NBA Trade Mapper: Salary Name Mismatch Audit ===\n');

  // 1. Load all player names from player_contracts (paginated)
  console.log('Loading player names from player_contracts...');
  const contractNames = new Set<string>();
  const contractNamesByLastName = new Map<string, string[]>(); // lastName → [fullName, ...]
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('player_contracts')
      .select('player_name')
      .range(from, from + 999);

    if (error) {
      console.error('Supabase error:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const name = row.player_name as string;
      contractNames.add(name);
      const last = extractLastName(name);
      if (!contractNamesByLastName.has(last)) {
        contractNamesByLastName.set(last, []);
      }
      const arr = contractNamesByLastName.get(last)!;
      if (!arr.includes(name)) arr.push(name);
    }

    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  Loaded ${contractNames.size} distinct player names from player_contracts.\n`);

  // Also load the seasons each player has contracts for (for context)
  console.log('Loading player-season coverage from player_contracts...');
  const contractSeasons = new Map<string, Set<string>>(); // playerName → Set<season>
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('player_contracts')
      .select('player_name, season')
      .range(from, from + 999);

    if (error) {
      console.error('Supabase error:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const name = row.player_name as string;
      const season = row.season as string;
      if (!contractSeasons.has(name)) contractSeasons.set(name, new Set());
      contractSeasons.get(name)!.add(season);
    }

    from += 1000;
    if (data.length < 1000) break;
  }
  console.log(`  Loaded season coverage for ${contractSeasons.size} players.\n`);

  // 2. Load all trade JSON files from 1990-91 onward
  const tradesDir = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
  const files = fs.readdirSync(tradesDir).filter(f => f.endsWith('.json')).sort();

  const allTrades: Trade[] = [];
  for (const file of files) {
    const season = file.replace('.json', '');
    if (seasonStartYear(season) < 1990) continue;
    const raw = fs.readFileSync(path.join(tradesDir, file), 'utf-8');
    const trades: Trade[] = JSON.parse(raw);
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} trades from 1990-91 onward (${files.filter(f => seasonStartYear(f.replace('.json', '')) >= 1990).length} season files).\n`);

  // 3. Find trades where NO player asset matches any contract name
  console.log('='.repeat(80));
  console.log('SECTION 1: Trades where ALL player assets are unmatched in player_contracts');
  console.log('='.repeat(80));
  console.log('(Only showing trades that have at least one player asset)\n');

  let fullyUnmatchedTradeCount = 0;
  let totalTradesWithPlayers = 0;
  const unmatchedPlayerNames = new Map<string, { count: number; seasons: Set<string> }>(); // name → occurrences

  for (const trade of allTrades) {
    const playerAssets = trade.assets.filter(a => a.type === 'player' && a.player_name);
    if (playerAssets.length === 0) continue;
    totalTradesWithPlayers++;

    const matched = playerAssets.filter(a => contractNames.has(a.player_name!));
    const unmatched = playerAssets.filter(a => !contractNames.has(a.player_name!));

    // Track all unmatched names
    for (const a of unmatched) {
      const name = a.player_name!;
      if (!unmatchedPlayerNames.has(name)) {
        unmatchedPlayerNames.set(name, { count: 0, seasons: new Set() });
      }
      const entry = unmatchedPlayerNames.get(name)!;
      entry.count++;
      entry.seasons.add(trade.season);
    }

    // Only print trades where ALL players are unmatched
    if (matched.length === 0) {
      fullyUnmatchedTradeCount++;
      console.log(`Trade: ${trade.title || trade.id}`);
      console.log(`  Season: ${trade.season}  |  Date: ${trade.date}`);
      console.log(`  Teams: ${trade.teams.map(t => t.team_id).join(' / ')}`);
      for (const a of unmatched) {
        const name = a.player_name!;
        const last = extractLastName(name);
        const nearMatches = contractNamesByLastName.get(last) || [];
        const filtered = nearMatches.filter(n => n !== name);
        console.log(`  UNMATCHED: "${name}" (${a.from_team_id} → ${a.to_team_id})`);
        if (filtered.length > 0) {
          console.log(`    Near-matches (same last name): ${filtered.join(', ')}`);
        } else {
          console.log(`    No near-matches found.`);
        }
      }
      console.log('');
    }
  }
  console.log(`Summary: ${fullyUnmatchedTradeCount} trades (out of ${totalTradesWithPlayers} with players) have NO player matching player_contracts.\n`);

  // 4. Now show ALL unique unmatched player names with near-matches
  console.log('='.repeat(80));
  console.log('SECTION 2: All unique unmatched player names across all trades (1990-91+)');
  console.log('='.repeat(80));
  console.log(`Total unique unmatched names: ${unmatchedPlayerNames.size}\n`);

  // Sort by count desc, then name
  const sortedUnmatched = [...unmatchedPlayerNames.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[0].localeCompare(b[0]);
  });

  for (const [name, info] of sortedUnmatched) {
    const last = extractLastName(name);
    const nearMatches = (contractNamesByLastName.get(last) || []).filter(n => n !== name);
    const seasonList = [...info.seasons].sort().join(', ');
    console.log(`"${name}" — ${info.count} trade(s) in: ${seasonList}`);
    if (nearMatches.length > 0) {
      console.log(`  NEAR-MATCH: ${nearMatches.join(', ')}`);
    }
  }

  // 5. Check became_player_name on pick assets
  console.log('\n' + '='.repeat(80));
  console.log('SECTION 3: Unmatched became_player_name on pick assets (1990-91+)');
  console.log('='.repeat(80));
  console.log('');

  const unmatchedPickNames = new Map<string, { count: number; seasons: Set<string> }>();

  for (const trade of allTrades) {
    const pickAssets = trade.assets.filter(
      a => a.type === 'pick' && a.became_player_name
    );
    for (const a of pickAssets) {
      const name = a.became_player_name!;
      if (!contractNames.has(name)) {
        if (!unmatchedPickNames.has(name)) {
          unmatchedPickNames.set(name, { count: 0, seasons: new Set() });
        }
        const entry = unmatchedPickNames.get(name)!;
        entry.count++;
        entry.seasons.add(trade.season);
      }
    }
  }

  console.log(`Total unique unmatched became_player_name values: ${unmatchedPickNames.size}\n`);

  const sortedPickUnmatched = [...unmatchedPickNames.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[0].localeCompare(b[0]);
  });

  for (const [name, info] of sortedPickUnmatched) {
    const last = extractLastName(name);
    const nearMatches = (contractNamesByLastName.get(last) || []).filter(n => n !== name);
    const seasonList = [...info.seasons].sort().join(', ');
    console.log(`"${name}" — ${info.count} pick(s) in: ${seasonList}`);
    if (nearMatches.length > 0) {
      console.log(`  NEAR-MATCH: ${nearMatches.join(', ')}`);
    }
  }

  // 6. Summary statistics
  console.log('\n' + '='.repeat(80));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(80));

  // Count trades that have at least one unmatched player
  let tradesWithAnyUnmatched = 0;
  let totalPlayerAssets = 0;
  let totalUnmatchedAssets = 0;
  for (const trade of allTrades) {
    const playerAssets = trade.assets.filter(a => a.type === 'player' && a.player_name);
    if (playerAssets.length === 0) continue;
    totalPlayerAssets += playerAssets.length;
    const unmatched = playerAssets.filter(a => !contractNames.has(a.player_name!));
    totalUnmatchedAssets += unmatched.length;
    if (unmatched.length > 0) tradesWithAnyUnmatched++;
  }

  console.log(`Trades from 1990-91 onward: ${allTrades.length}`);
  console.log(`Trades with player assets: ${totalTradesWithPlayers}`);
  console.log(`Trades with at least one unmatched player: ${tradesWithAnyUnmatched} (${(tradesWithAnyUnmatched / totalTradesWithPlayers * 100).toFixed(1)}%)`);
  console.log(`Trades where ALL players unmatched: ${fullyUnmatchedTradeCount} (${(fullyUnmatchedTradeCount / totalTradesWithPlayers * 100).toFixed(1)}%)`);
  console.log(`Total player assets: ${totalPlayerAssets}`);
  console.log(`Unmatched player assets: ${totalUnmatchedAssets} (${(totalUnmatchedAssets / totalPlayerAssets * 100).toFixed(1)}%)`);
  console.log(`Unique unmatched player names: ${unmatchedPlayerNames.size}`);
  console.log(`Unique unmatched became_player_name: ${unmatchedPickNames.size}`);
  console.log(`player_contracts distinct names: ${contractNames.size}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
