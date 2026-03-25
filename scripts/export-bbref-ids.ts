// Extracts unique player name → bbref player_id from Kaggle Per Game CSV.
// Output: src/lib/bbref-player-ids.ts (same pattern as nba-player-ids.ts)

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

const CSV_PATH = path.join(__dirname, '../data/kaggle/Player Per Game.csv');
const OUT_PATH = path.join(__dirname, '../src/lib/bbref-player-ids.ts');

const raw = readFileSync(CSV_PATH, 'utf-8');
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as {
  player: string;
  player_id: string;
}[];

// Build name → bbref_id map. Later rows overwrite earlier (same player, same ID).
const map = new Map<string, string>();
for (const row of rows) {
  const name = row.player.replace(/\*/g, '').trim();
  const id = row.player_id?.trim();
  if (name && id) {
    map.set(name, id);
  }
}

// Sort by name for stable output
const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const lines = sorted.map(([name, id]) => `  ${JSON.stringify(name)}: ${JSON.stringify(id)},`);
const ts = `// Auto-generated from Kaggle Per Game CSV. ${sorted.length.toLocaleString()} players → bbref_id.
// Used as fallback headshot source when NBA CDN returns placeholder.
// Regenerate: npx tsx scripts/export-bbref-ids.ts

export const BBREF_PLAYER_IDS: Record<string, string> = {
${lines.join('\n')}
};
`;

writeFileSync(OUT_PATH, ts, 'utf-8');
console.log(`Wrote ${sorted.length} entries to ${OUT_PATH}`);
