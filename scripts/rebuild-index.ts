/**
 * Rebuild index.json from existing season JSON files.
 * Adds topAssets field (top player sent FROM each team).
 *
 * Usage: npx tsx scripts/rebuild-index.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');

interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
}

interface SearchIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
  topAssets: string[];
}

function main() {
  const allSeasonFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));
  const newIndex: SearchIndexEntry[] = [];

  for (const file of allSeasonFiles) {
    const trades: StaticTrade[] = JSON.parse(
      fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'),
    );
    for (const t of trades) {
      const players = t.assets
        .flatMap((a) => [a.player_name, a.became_player_name])
        .filter((n): n is string => !!n)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      const topAssets = t.teams.map(({ team_id }) => {
        const asset = t.assets.find(
          (a) => a.type === 'player' && a.player_name && a.from_team_id === team_id,
        );
        return asset?.player_name || '';
      });

      newIndex.push({
        id: t.id,
        date: t.date,
        season: t.season,
        title: t.title,
        teams: t.teams.map((x) => x.team_id),
        players,
        topAssets,
      });
    }
  }

  const indexPath = path.join(OUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(newIndex));
  const indexSizeKB = (Buffer.byteLength(JSON.stringify(newIndex)) / 1024).toFixed(1);

  console.log(`Rebuilt index: ${newIndex.length} entries (${indexSizeKB} KB)`);

  // Show a few examples
  const examples = newIndex
    .filter((e) => e.topAssets.filter(Boolean).length >= 2)
    .slice(0, 5);
  for (const e of examples) {
    const lastName = (n: string) => n.split(' ').pop() || n;
    const names = e.topAssets.filter(Boolean).map(lastName);
    console.log(`  ${e.season} | ${names[0]} for ${names[1]} | teams: ${e.teams.join(', ')}`);
  }
}

main();
