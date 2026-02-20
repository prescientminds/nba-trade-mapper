/**
 * Export all existing trades from Supabase to static JSON files.
 *
 * Outputs:
 *   public/data/trades/by-season/{season}.json — one file per season
 *   public/data/trades/index.json              — search index
 *
 * Usage: npx tsx scripts/export-existing-trades.ts
 */

import { supabase } from './lib/supabase-admin';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');

interface DbTrade {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  season: string;
  is_multi_team: boolean;
  transaction_teams: {
    id: string;
    team_id: string;
    role: string;
  }[];
  transaction_assets: {
    id: string;
    asset_type: string;
    player_name: string | null;
    from_team_id: string | null;
    to_team_id: string | null;
    pick_year: number | null;
    pick_round: number | null;
    original_team_id: string | null;
    became_player_name: string | null;
    notes: string | null;
  }[];
}

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: {
    type: string;
    player_name: string | null;
    from_team_id: string | null;
    to_team_id: string | null;
    pick_year: number | null;
    pick_round: number | null;
    original_team_id: string | null;
    became_player_name: string | null;
    notes: string | null;
  }[];
}

interface SearchIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
}

/**
 * Try to fix from_team/to_team on assets by parsing the description text.
 * The CSV-imported trades often have incorrect from/to due to multi-team handling.
 */
function fixAssetDirectionality(trade: DbTrade): DbTrade {
  const desc = (trade.description || '').toLowerCase();
  if (!desc) return trade;

  const teamIds = trade.transaction_teams.map((t) => t.team_id);

  for (const asset of trade.transaction_assets) {
    if (asset.asset_type !== 'player' || !asset.player_name) continue;

    const playerLower = asset.player_name.toLowerCase();

    // Try patterns like "Team acquires Player" or "Player to Team"
    for (const tid of teamIds) {
      const tidLower = tid.toLowerCase();
      // "LAL acquire Kobe Bryant" or "Lakers acquire Kobe Bryant"
      if (
        desc.includes(`${tidLower} acquire`) &&
        desc.includes(playerLower)
      ) {
        asset.to_team_id = tid;
        const otherTeam = teamIds.find((t) => t !== tid);
        if (otherTeam) asset.from_team_id = otherTeam;
        break;
      }
    }
  }

  return trade;
}

function convertToStatic(trade: DbTrade): StaticTrade {
  return {
    id: trade.id,
    date: trade.date,
    season: trade.season,
    title: trade.title,
    description: trade.description || '',
    is_multi_team: trade.is_multi_team,
    teams: trade.transaction_teams.map((tt) => ({
      team_id: tt.team_id,
      role: tt.role,
    })),
    assets: trade.transaction_assets.map((a) => ({
      type: a.asset_type as 'player' | 'pick' | 'swap' | 'cash',
      player_name: a.player_name,
      from_team_id: a.from_team_id,
      to_team_id: a.to_team_id,
      pick_year: a.pick_year,
      pick_round: a.pick_round,
      original_team_id: a.original_team_id,
      became_player_name: a.became_player_name,
      notes: a.notes,
    })),
  };
}

function buildIndexEntry(trade: StaticTrade): SearchIndexEntry {
  const players = trade.assets
    .filter((a) => a.player_name)
    .map((a) => a.player_name!)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    id: trade.id,
    date: trade.date,
    season: trade.season,
    title: trade.title,
    teams: trade.teams.map((t) => t.team_id),
    players,
  };
}

async function main() {
  console.log('Fetching all trades from Supabase...');

  // Fetch in pages of 1000 (Supabase max)
  const allTrades: DbTrade[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, transaction_teams(id, team_id, role), transaction_assets(*)')
      .eq('type', 'trade')
      .order('date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Supabase error:', error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    allTrades.push(...(data as DbTrade[]));
    console.log(`  Fetched ${allTrades.length} trades so far...`);

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`Total trades fetched: ${allTrades.length}`);

  // Fix directionality
  const fixed = allTrades.map(fixAssetDirectionality);

  // Group by season
  const bySeason = new Map<string, StaticTrade[]>();
  const searchIndex: SearchIndexEntry[] = [];

  for (const trade of fixed) {
    const st = convertToStatic(trade);
    const season = st.season || 'unknown';

    if (!bySeason.has(season)) bySeason.set(season, []);
    bySeason.get(season)!.push(st);
    searchIndex.push(buildIndexEntry(st));
  }

  // Ensure output dirs exist
  fs.mkdirSync(SEASON_DIR, { recursive: true });

  // Write season files
  let totalWritten = 0;
  for (const [season, trades] of bySeason) {
    const filePath = path.join(SEASON_DIR, `${season}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    console.log(`  ${season}: ${trades.length} trades`);
    totalWritten += trades.length;
  }

  // Write search index
  const indexPath = path.join(OUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(searchIndex));
  const indexSizeKB = (Buffer.byteLength(JSON.stringify(searchIndex)) / 1024).toFixed(1);
  console.log(`\nSearch index: ${searchIndex.length} entries (${indexSizeKB} KB)`);

  console.log(`\nDone! Wrote ${totalWritten} trades across ${bySeason.size} seasons.`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
