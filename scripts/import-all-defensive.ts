/**
 * One-time script to import NBA All-Defensive Team accolades.
 * These were missed by import-accolades.ts due to a case mismatch
 * ('all-defensive' vs CSV's 'All-Defense').
 *
 * Safe to run: checks for existing entries before inserting.
 *
 * Usage: npx tsx scripts/import-all-defensive.ts
 */

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { bbrefSeasonToOurs } from './lib/team-resolver';

const DATA_DIR = path.join(__dirname, '..', 'data', 'kaggle');

function cleanPlayerName(name: string): string {
  return name.replace(/\*/g, '').trim();
}

async function main() {
  const csvPath = path.join(DATA_DIR, 'End of Season Teams.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing: ${csvPath}`);
    process.exit(1);
  }

  console.log('Reading End of Season Teams.csv...');
  const csv = fs.readFileSync(csvPath, 'utf-8');
  const rows: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const accolades: Array<{ player_name: string; accolade: string; season: string }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const endYear = parseInt(row.season);
    if (isNaN(endYear) || endYear < 1977) continue;
    const type = row.type?.toLowerCase() || '';
    if (!type.includes('all-defense')) continue;

    const season = bbrefSeasonToOurs(endYear);
    const player = cleanPlayerName(row.player);
    const teamNum = row.number_tm;
    const ordinal = teamNum === '1st' ? '1st' : '2nd';
    const accolade = `All-Defensive ${ordinal} Team`;

    const key = `${player}|${accolade}|${season}`;
    if (seen.has(key)) continue;
    seen.add(key);
    accolades.push({ player_name: player, accolade, season });
  }

  console.log(`All-Defensive entries found in CSV: ${accolades.length}`);

  if (accolades.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // Insert in batches
  const BATCH = 200;
  let inserted = 0;

  for (let i = 0; i < accolades.length; i += BATCH) {
    const batch = accolades.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_accolades')
      .insert(batch);

    if (error) {
      console.error(`Batch error at ${i}: ${error.message} — retrying row-by-row...`);
      for (const row of batch) {
        const { error: rowErr } = await supabase
          .from('player_accolades')
          .insert([row]);
        if (rowErr) {
          console.error(`  Row error: ${row.player_name} ${row.season} ${row.accolade}: ${rowErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\nDone! Inserted ${inserted} All-Defensive accolades.`);
}

main().catch(console.error);
