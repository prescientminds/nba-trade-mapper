/**
 * Import player accolades from Kaggle BBRef datasets.
 *
 * Reads from data/kaggle/:
 *   - "Player Award Shares.csv" — MVP, DPOY, ROY winners
 *   - "End of Season Teams.csv" — All-NBA 1st/2nd/3rd
 *   - "All-Star Selections.csv" — All-Star picks
 *
 * Usage: npx tsx scripts/import-accolades.ts
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

function readCsvIfExists(filename: string): Record<string, string>[] | null {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${filename} (not found)`);
    return null;
  }
  console.log(`Reading ${filename}...`);
  const csv = fs.readFileSync(filePath, 'utf-8');
  return parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

async function main() {
  const accolades: Array<{
    player_name: string;
    accolade: string;
    season: string;
  }> = [];

  const seen = new Set<string>(); // Dedup key

  function addAccolade(playerName: string, accolade: string, season: string) {
    const key = `${playerName}|${accolade}|${season}`;
    if (seen.has(key)) return;
    seen.add(key);
    accolades.push({ player_name: playerName, accolade, season });
  }

  // 1. Award Shares (MVP, DPOY, ROY, SMOY, MIP)
  const awards = readCsvIfExists('Player Award Shares.csv');
  if (awards) {
    for (const row of awards) {
      const endYear = parseInt(row.season);
      if (isNaN(endYear) || endYear < 1977) continue;
      const season = bbrefSeasonToOurs(endYear);
      const player = cleanPlayerName(row.player);
      const winner = row.winner?.toUpperCase() === 'TRUE';

      if (winner) {
        const awardMap: Record<string, string> = {
          'nba mvp': 'MVP',
          'nba dpoy': 'DPOY',
          'nba roy': 'ROY',
          'nba smoy': 'Sixth Man',
          'nba mip': 'MIP',
          'nba clutch_poy': 'Clutch POY',
        };
        const awardType = row.award?.toLowerCase();
        const accolade = awardMap[awardType];
        if (accolade) {
          addAccolade(player, accolade, season);
        }
      }
    }
    console.log(`Awards winners found: ${accolades.length}`);
  }

  // 2. End of Season Teams (All-NBA)
  const seasonTeams = readCsvIfExists('End of Season Teams.csv');
  if (seasonTeams) {
    const beforeCount = accolades.length;
    for (const row of seasonTeams) {
      const endYear = parseInt(row.season);
      if (isNaN(endYear) || endYear < 1977) continue;
      const season = bbrefSeasonToOurs(endYear);
      const player = cleanPlayerName(row.player);
      const type = row.type?.toLowerCase() || '';
      const teamNum = row.number_tm;

      if (type.includes('all-nba')) {
        // CSV stores ordinal strings: '1st', '2nd', '3rd' — use directly
        const ordinal = teamNum === '1st' ? '1st' : teamNum === '2nd' ? '2nd' : '3rd';
        addAccolade(player, `All-NBA ${ordinal} Team`, season);
      } else if (type.includes('all-defense')) {
        const ordinal = teamNum === '1st' ? '1st' : '2nd';
        addAccolade(player, `All-Defensive ${ordinal} Team`, season);
      } else if (type.includes('all-rookie')) {
        addAccolade(player, 'All-Rookie Team', season);
      }
    }
    console.log(`Season team awards added: ${accolades.length - beforeCount}`);
  }

  // 3. All-Star Selections
  const allStars = readCsvIfExists('All-Star Selections.csv');
  if (allStars) {
    const beforeCount = accolades.length;
    for (const row of allStars) {
      const endYear = parseInt(row.season);
      if (isNaN(endYear) || endYear < 1977) continue;
      const season = bbrefSeasonToOurs(endYear);
      const player = cleanPlayerName(row.player);
      addAccolade(player, 'All-Star', season);
    }
    console.log(`All-Star selections added: ${accolades.length - beforeCount}`);
  }

  if (accolades.length === 0) {
    console.log('No accolades to import. Make sure CSV files are in data/kaggle/');
    return;
  }

  console.log(`\nTotal accolades to upsert: ${accolades.length}`);

  // Insert in batches (wipe table before re-running to avoid duplicates)
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

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

    if ((i + BATCH) % 2000 === 0 || i + BATCH >= accolades.length) {
      console.log(`Progress: ${Math.min(i + BATCH, accolades.length)}/${accolades.length}`);
    }
  }

  console.log(`\nDone! Inserted ${inserted} accolades (${errors} batch errors).`);
}

main().catch(console.error);
