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

    // W/L only. playoff_result + championship are owned by
    // scrape-playoff-results.ts (real rounds from BBRef brackets). This CSV
    // only has a TRUE/FALSE playoffs flag, and writing it flattened every
    // season to R1 with no champion (see 2026-06-24 repair). Upsert updates
    // only the columns sent, so omitting them leaves the bracket data intact.
    upsertRows.push({
      team_id: teamId,
      season,
      wins,
      losses,
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
