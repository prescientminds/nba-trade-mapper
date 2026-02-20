/**
 * Export draft pick data from Kaggle CSV to a static JSON file.
 *
 * Reads data/kaggle/Draft Pick History.csv and writes public/data/drafts.json
 * as a lookup map keyed by normalized player name (lowercase).
 *
 * Usage: npx tsx scripts/export-draft-data.ts
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamId } from './lib/team-resolver';

const DRAFT_CSV = path.join(__dirname, '..', 'data', 'kaggle', 'Draft Pick History.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'drafts.json');

export interface DraftEntry {
  year: number;
  round: number;
  pick: number;
  teamId: string;
}

function main() {
  console.log('Reading Draft Pick History.csv...');
  const csv = fs.readFileSync(DRAFT_CSV, 'utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  const drafts: Record<string, DraftEntry> = {};
  let skipped = 0;

  for (const row of records) {
    const player = (row.player || '').replace(/\*/g, '').trim();
    if (!player) { skipped++; continue; }

    const year = parseInt(row.season);
    const round = parseInt(row.round);
    const pick = parseInt(row.overall_pick);
    const teamAbbr = row.tm || '';
    const teamId = resolveTeamId(teamAbbr);

    if (isNaN(year) || isNaN(round) || isNaN(pick) || !teamId) {
      skipped++;
      continue;
    }

    const key = player.toLowerCase();

    // Keep the earliest draft entry for each player (first time drafted)
    if (!drafts[key]) {
      drafts[key] = { year, round, pick, teamId };
    }
  }

  const count = Object.keys(drafts).length;
  console.log(`Exported ${count} draft entries (skipped ${skipped} rows)`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(drafts));
  console.log(`Written to ${OUTPUT_PATH}`);
}

main();
