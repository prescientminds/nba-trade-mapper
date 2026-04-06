/**
 * Reorder trade titles so players are listed by win shares (descending).
 *
 * For each trade:
 *   1. Collect all player names from trade_scores (includes picks-that-became-players)
 *   2. Sort by WS descending
 *   3. Take top 3 names
 *   4. Rebuild title as "Name1, Name2, Name3 Trade"
 *
 * Trades without trade_scores keep their existing title.
 *
 * Usage: npx tsx scripts/reorder-titles.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');

interface AssetScore {
  name: string;
  type: 'player' | 'pick';
  ws: number;
}

interface TeamScoreData {
  score: number;
  assets: AssetScore[];
}

interface TradeScoreRow {
  trade_id: string;
  team_scores: Record<string, TeamScoreData>;
}

interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  became_player_name: string | null;
  [key: string]: unknown;
}

interface StaticTrade {
  id: string;
  title: string;
  date: string;
  season: string;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
  topAssets?: string[];
  [key: string]: unknown;
}

async function fetchAll(table: string, select: string): Promise<TradeScoreRow[]> {
  const all: TradeScoreRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as TradeScoreRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  // Load all trade scores
  console.log('Fetching trade_scores from Supabase...');
  const scores = await fetchAll('trade_scores', 'trade_id, team_scores');
  console.log(`  ${scores.length} scored trades`);

  // Build lookup: trade_id → all players with WS (deduplicated, sorted by WS desc)
  const playersByTrade = new Map<string, { name: string; ws: number }[]>();

  for (const row of scores) {
    if (!row.team_scores) continue;
    const seen = new Map<string, number>(); // name → best WS

    for (const teamData of Object.values(row.team_scores)) {
      if (!teamData.assets) continue;
      for (const asset of teamData.assets) {
        if (!asset.name) continue;
        // Filter out non-player names that leak from trade_scores
        const lower = asset.name.toLowerCase();
        if (lower.includes('trade exception') || lower.includes('cash consideration') ||
            lower.includes('did not convey') || lower.includes('-rd pick') ||
            lower.includes('pick is') || lower.includes('pick swap')) continue;
        const existing = seen.get(asset.name) ?? -Infinity;
        if (asset.ws > existing) {
          seen.set(asset.name, asset.ws);
        }
      }
    }

    const players = [...seen.entries()]
      .map(([name, ws]) => ({ name, ws }))
      .sort((a, b) => b.ws - a.ws);

    playersByTrade.set(row.trade_id, players);
  }

  // Process each season file
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter(f => f.endsWith('.json'));
  let total = 0;
  let changed = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fileChanged = false;

    for (const trade of trades) {
      total++;
      const scoredPlayers = playersByTrade.get(trade.id);
      if (!scoredPlayers || scoredPlayers.length === 0) continue;

      // Build new title from top 3 players by WS
      const topNames = scoredPlayers.slice(0, 3).map(p => p.name);
      const newTitle = topNames.length > 0
        ? `${topNames.join(', ')} Trade`
        : trade.title; // fallback

      if (newTitle !== trade.title) {
        changed++;
        trade.title = newTitle;
        fileChanged = true;
      }
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    }
  }

  console.log(`\nProcessed ${total} trades, changed ${changed} titles`);

  // Show some examples
  console.log('\nExamples:');
  for (const file of seasonFiles) {
    const trades: StaticTrade[] = JSON.parse(
      fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'),
    );
    for (const t of trades) {
      const scored = playersByTrade.get(t.id);
      if (scored && scored.length >= 3) {
        console.log(`  ${t.season} | ${t.title} | WS: ${scored.slice(0, 3).map(p => `${p.name}(${p.ws.toFixed(1)})`).join(', ')}`);
        break;
      }
    }
  }

  // Rebuild index
  console.log('\nRebuilding index...');
  interface IndexEntry {
    id: string; date: string; season: string; title: string;
    teams: string[]; players: string[]; topAssets: string[];
  }
  const newIndex: IndexEntry[] = [];

  for (const file of seasonFiles) {
    const trades: StaticTrade[] = JSON.parse(
      fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'),
    );
    for (const t of trades) {
      const players = t.assets
        .flatMap(a => [a.player_name, a.became_player_name])
        .filter((n): n is string => !!n)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      newIndex.push({
        id: t.id,
        date: t.date,
        season: t.season,
        title: t.title,
        teams: t.teams.map(x => x.team_id),
        players,
        topAssets: t.topAssets || [],
      });
    }
  }

  const indexPath = path.join(OUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(newIndex));
  const sizeKB = (Buffer.byteLength(JSON.stringify(newIndex)) / 1024).toFixed(1);
  console.log(`Index: ${newIndex.length} entries (${sizeKB} KB)`);
}

main().catch(console.error);
