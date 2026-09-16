/**
 * Export draft pick data from Kaggle CSV to a static JSON file.
 *
 * Reads data/kaggle/Draft Pick History.csv and writes public/data/drafts.json
 * as a lookup map keyed by normalized player name (lowercase).
 *
 * Kaggle lags the June draft by months, so any draft year present in
 * public/data/draft-ownership.json (Wikipedia scrape) but absent from the
 * Kaggle CSV is back-filled from the ownership table (selecting_team = teamId).
 *
 * Usage: npx tsx scripts/export-draft-data.ts
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamId } from './lib/team-resolver';

const DRAFT_CSV = path.join(__dirname, '..', 'data', 'kaggle', 'Draft Pick History.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'drafts.json');
const OWNERSHIP_PATH = path.join(__dirname, '..', 'public', 'data', 'draft-ownership.json');

interface OwnershipPick {
  year: number;
  round: number;
  overall_pick: number;
  player: string;
  selecting_team: string;
}

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

  // Back-fill draft years Kaggle hasn't published yet from draft-ownership.json
  const kaggleMaxYear = Math.max(...Object.values(drafts).map((d) => d.year));
  if (fs.existsSync(OWNERSHIP_PATH)) {
    const ownership = JSON.parse(fs.readFileSync(OWNERSHIP_PATH, 'utf-8')) as OwnershipPick[];
    let added = 0;
    for (const p of ownership) {
      if (p.year <= kaggleMaxYear || !p.player) continue;
      const key = p.player.trim().toLowerCase();
      if (!drafts[key]) {
        drafts[key] = { year: p.year, round: p.round, pick: p.overall_pick, teamId: p.selecting_team };
        added++;
      }
    }
    console.log(`Kaggle covers drafts through ${kaggleMaxYear}; back-filled ${added} picks from draft-ownership.json`);
  }

  const count = Object.keys(drafts).length;
  console.log(`Exported ${count} draft entries (skipped ${skipped} rows)`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(drafts));
  console.log(`Written to ${OUTPUT_PATH}`);
}

main();
