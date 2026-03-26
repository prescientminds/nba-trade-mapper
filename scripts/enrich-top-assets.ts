/**
 * Enrich topAssets in season JSON files using WS data from trade_scores.
 *
 * For each trade, picks the highest-WS asset sent FROM each team.
 * Includes picks with became_player_name (e.g. Gary Payton > Alton Lister).
 *
 * Usage: npx tsx scripts/enrich-top-assets.ts
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
  // Load all trade scores from Supabase
  console.log('Fetching trade_scores from Supabase...');
  const scores = await fetchAll('trade_scores', 'trade_id, team_scores');
  console.log(`  ${scores.length} scored trades`);

  // Build lookup: trade_id → best asset per team (by WS from the RECEIVING team's perspective)
  // team_scores is keyed by RECEIVING team_id, with assets that went TO that team
  const bestAssetByTrade = new Map<string, Map<string, { name: string; ws: number }>>();

  for (const row of scores) {
    if (!row.team_scores) continue;
    // For each receiving team, find the asset with highest WS
    // But topAssets needs: top player sent FROM each team
    // team_scores[receivingTeam].assets = players/picks that went TO that team (i.e. FROM the other team)
    const tradeMap = new Map<string, { name: string; ws: number }>();

    for (const [receivingTeamId, teamData] of Object.entries(row.team_scores)) {
      if (!teamData.assets || teamData.assets.length === 0) continue;
      // These assets were SENT TO receivingTeamId, meaning they came FROM the other team
      // We need to figure out which team they came FROM
      // For 2-team trades, the "from" team is the other team
      // For multi-team, we need the asset-level from_team_id (not available in score data)
      // Store by receiving team for now — we'll map it at the trade level
      const best = teamData.assets.reduce((a, b) => (b.ws > a.ws ? b : a), teamData.assets[0]);
      if (best && best.name) {
        tradeMap.set(receivingTeamId, { name: best.name, ws: best.ws });
      }
    }

    bestAssetByTrade.set(row.trade_id, tradeMap);
  }

  // Process each season file
  const seasonFiles = fs.readdirSync(SEASON_DIR).filter(f => f.endsWith('.json'));
  let updated = 0;
  let total = 0;
  let changed = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades: StaticTrade[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fileChanged = false;

    for (const trade of trades) {
      total++;
      const scoreData = bestAssetByTrade.get(trade.id);

      // Build topAssets: for each team in the trade, find the best player SENT FROM that team
      // The score data has: team_scores[receivingTeam].assets = what was received
      // So the best asset FROM team X is the best asset in team_scores[Y].assets (where Y received it)
      const teamIds = trade.teams.map(t => t.team_id);

      // Collect best asset from each team, with WS for sorting
      const perTeam: { name: string; ws: number; fromTeamId: string }[] = teamIds.map(fromTeamId => {
        if (scoreData) {
          const otherTeams = teamIds.filter(t => t !== fromTeamId);
          let bestName = '';
          let bestWs = -Infinity;
          for (const otherTeam of otherTeams) {
            const otherData = scoreData.get(otherTeam);
            if (otherData && otherData.ws > bestWs) {
              bestWs = otherData.ws;
              bestName = otherData.name;
            }
          }
          if (bestName) return { name: bestName, ws: bestWs, fromTeamId };
        }

        // Fallback: use static asset data — include became_player_name picks
        const candidates: { name: string; priority: number }[] = [];
        for (const asset of trade.assets) {
          if (asset.from_team_id !== fromTeamId) continue;
          if (asset.type === 'player' && asset.player_name) {
            candidates.push({ name: asset.player_name, priority: 1 });
          } else if (asset.type === 'pick' && asset.became_player_name) {
            candidates.push({ name: asset.became_player_name, priority: 2 });
          }
        }
        candidates.sort((a, b) => a.priority - b.priority);
        return { name: candidates[0]?.name || '', ws: 0, fromTeamId };
      });

      // Sort by WS descending so the most impactful player leads the heading
      perTeam.sort((a, b) => b.ws - a.ws);
      const newTopAssets = perTeam.map(p => p.name);

      const oldTopAssets = trade.topAssets || [];
      if (JSON.stringify(newTopAssets) !== JSON.stringify(oldTopAssets)) {
        changed++;
      }
      trade.topAssets = newTopAssets;
      updated++;
      fileChanged = true;
    }

    if (fileChanged) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    }
  }

  console.log(`Updated ${updated} trades across ${seasonFiles.length} files (${changed} changed)`);

  // Rebuild index
  console.log('Rebuilding index...');
  const newIndex: Array<{
    id: string; date: string; season: string; title: string;
    teams: string[]; players: string[]; topAssets: string[];
  }> = [];

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
        date: (t as Record<string, unknown>).date as string,
        season: (t as Record<string, unknown>).season as string,
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

  // Show examples of changed trades
  const examples = newIndex
    .filter(e => e.topAssets.filter(Boolean).length >= 2)
    .filter(e => {
      const oldTrade = bestAssetByTrade.get(e.id);
      return oldTrade && oldTrade.size > 0;
    })
    .slice(0, 5);
  for (const e of examples) {
    const lastName = (n: string) => n.split(' ').pop() || n;
    const names = e.topAssets.filter(Boolean).map(lastName);
    console.log(`  ${e.season} | ${names[0]} for ${names[1]}`);
  }
}

main().catch(console.error);
