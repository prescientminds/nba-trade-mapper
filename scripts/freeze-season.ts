/**
 * Freeze a completed season's trade data.
 *
 * At end-of-season, run this to finalize the JSON file.
 * After freezing, the daily scraper will start a new season file.
 *
 * Usage: npx tsx scripts/freeze-season.ts 2024-25
 */

import * as fs from 'fs';
import * as path from 'path';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

async function main() {
  const season = process.argv[2];
  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    console.error('Usage: npx tsx scripts/freeze-season.ts <season>');
    console.error('Example: npx tsx scripts/freeze-season.ts 2024-25');
    process.exit(1);
  }

  const filePath = path.join(SEASON_DIR, `${season}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`Season file not found: ${filePath}`);
    process.exit(1);
  }

  const trades = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Sort by date
  trades.sort((a: { date: string }, b: { date: string }) =>
    a.date.localeCompare(b.date)
  );

  // Write minified (saves space for frozen seasons)
  fs.writeFileSync(filePath, JSON.stringify(trades));

  const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(1);
  console.log(`Frozen season ${season}: ${trades.length} trades (${sizeKB} KB)`);
}

main().catch(console.error);
