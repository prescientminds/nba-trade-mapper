/**
 * Import team season records from Kaggle BBRef datasets.
 *
 * Reads from data/kaggle/:
 *   - "Team Summaries.csv" — Team W/L, playoff results
 *
 * Usage: npx tsx scripts/import-team-seasons.ts
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId, bbrefSeasonToOurs } from './lib/team-resolver';

const DATA_DIR = path.join(__dirname, '..', 'data', 'kaggle');

async function main() {
  const filePath = path.join(DATA_DIR, 'Team Summaries.csv');
  if (!fs.existsSync(filePath)) {
    console.error(`Missing file: ${filePath}`);
    console.error('Download from: https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats');
    process.exit(1);
  }

  console.log('Reading Team Summaries.csv...');
  const csv = fs.readFileSync(filePath, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  console.log(`Total rows: ${rows.length}`);

  const upsertRows: Array<{
    team_id: string;
    season: string;
    wins: number | null;
    losses: number | null;
    playoff_result: string | null;
    championship: boolean;
  }> = [];

  let skipped = 0;

  for (const row of rows) {
    const endYear = parseInt(row.season);
    if (isNaN(endYear) || endYear < 1977) {
      skipped++;
      continue;
    }

    // Filter to NBA only (lg = NBA)
    if (row.lg && row.lg !== 'NBA') {
      skipped++;
      continue;
    }

    const teamId = resolveTeamId(row.abbreviation || row.tm || '');
    if (!teamId) {
      skipped++;
      continue;
    }

    const season = bbrefSeasonToOurs(endYear);
    const wins = parseInt(row.w) || null;
    const losses = parseInt(row.l) || null;

    // Determine playoff result from the 'playoffs' column
    // This dataset only has TRUE/FALSE for playoffs
    let playoffResult: string | null = null;
    let championship = false;
    const playoffCol = (row.playoffs || '').trim().toUpperCase();

    if (playoffCol === 'TRUE') {
      playoffResult = 'R1'; // We only know they made playoffs; sample_data.sql has specific results
    }

    upsertRows.push({
      team_id: teamId,
      season,
      wins,
      losses,
      playoff_result: playoffResult,
      championship,
    });
  }

  console.log(`Rows to upsert: ${upsertRows.length} (skipped: ${skipped})`);

  // Upsert in batches
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < upsertRows.length; i += BATCH) {
    const batch = upsertRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('team_seasons')
      .upsert(batch, { onConflict: 'team_id,season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\nDone! Upserted ${inserted} team-seasons (${errors} batch errors).`);
}

main().catch(console.error);
