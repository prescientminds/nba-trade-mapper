/**
 * One-time script to insert 2024-25 NBA accolades.
 * The Kaggle CSVs only go through 2023-24, so these are manually sourced
 * from NBA.com official announcements.
 *
 * Usage: npx tsx scripts/import-2024-25-accolades.ts
 */

import { supabase } from './lib/supabase-admin';

const SEASON = '2024-25';

const accolades: Array<{ player_name: string; accolade: string; season: string }> = [
  // ── Individual Awards ──────────────────────────────────────────────
  { player_name: 'Shai Gilgeous-Alexander', accolade: 'MVP', season: SEASON },
  { player_name: 'Shai Gilgeous-Alexander', accolade: 'Finals MVP', season: SEASON },
  { player_name: 'Evan Mobley', accolade: 'DPOY', season: SEASON },
  { player_name: 'Stephon Castle', accolade: 'ROY', season: SEASON },
  { player_name: 'Dyson Daniels', accolade: 'MIP', season: SEASON },
  { player_name: 'Payton Pritchard', accolade: 'Sixth Man', season: SEASON },

  // ── All-NBA 1st Team ───────────────────────────────────────────────
  { player_name: 'Giannis Antetokounmpo', accolade: 'All-NBA 1st Team', season: SEASON },
  { player_name: 'Shai Gilgeous-Alexander', accolade: 'All-NBA 1st Team', season: SEASON },
  { player_name: 'Nikola Jokic', accolade: 'All-NBA 1st Team', season: SEASON },
  { player_name: 'Donovan Mitchell', accolade: 'All-NBA 1st Team', season: SEASON },
  { player_name: 'Jayson Tatum', accolade: 'All-NBA 1st Team', season: SEASON },

  // ── All-NBA 2nd Team ───────────────────────────────────────────────
  { player_name: 'Anthony Edwards', accolade: 'All-NBA 2nd Team', season: SEASON },
  { player_name: 'Evan Mobley', accolade: 'All-NBA 2nd Team', season: SEASON },
  { player_name: 'Stephen Curry', accolade: 'All-NBA 2nd Team', season: SEASON },
  { player_name: 'Jalen Brunson', accolade: 'All-NBA 2nd Team', season: SEASON },
  { player_name: 'LeBron James', accolade: 'All-NBA 2nd Team', season: SEASON },

  // ── All-NBA 3rd Team ───────────────────────────────────────────────
  { player_name: 'Cade Cunningham', accolade: 'All-NBA 3rd Team', season: SEASON },
  { player_name: 'Tyrese Haliburton', accolade: 'All-NBA 3rd Team', season: SEASON },
  { player_name: 'James Harden', accolade: 'All-NBA 3rd Team', season: SEASON },
  { player_name: 'Karl-Anthony Towns', accolade: 'All-NBA 3rd Team', season: SEASON },
  { player_name: 'Jalen Williams', accolade: 'All-NBA 3rd Team', season: SEASON },

  // ── All-Defensive 1st Team ─────────────────────────────────────────
  { player_name: 'Dyson Daniels', accolade: 'All-Defensive 1st Team', season: SEASON },
  { player_name: 'Luguentz Dort', accolade: 'All-Defensive 1st Team', season: SEASON },
  { player_name: 'Draymond Green', accolade: 'All-Defensive 1st Team', season: SEASON },
  { player_name: 'Evan Mobley', accolade: 'All-Defensive 1st Team', season: SEASON },
  { player_name: 'Amen Thompson', accolade: 'All-Defensive 1st Team', season: SEASON },

  // ── All-Defensive 2nd Team ─────────────────────────────────────────
  { player_name: 'Toumani Camara', accolade: 'All-Defensive 2nd Team', season: SEASON },
  { player_name: 'Rudy Gobert', accolade: 'All-Defensive 2nd Team', season: SEASON },
  { player_name: 'Jaren Jackson Jr.', accolade: 'All-Defensive 2nd Team', season: SEASON },
  { player_name: 'Jalen Williams', accolade: 'All-Defensive 2nd Team', season: SEASON },
  { player_name: 'Ivica Zubac', accolade: 'All-Defensive 2nd Team', season: SEASON },

  // ── All-Rookie 1st Team ────────────────────────────────────────────
  { player_name: 'Stephon Castle', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Zach Edey', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Jaylen Wells', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Zaccharie Risacher', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Alex Sarr', accolade: 'All-Rookie Team', season: SEASON },

  // ── All-Rookie 2nd Team ────────────────────────────────────────────
  { player_name: 'Matas Buzelis', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Bub Carrington', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Donovan Clingan', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: 'Yves Missi', accolade: 'All-Rookie Team', season: SEASON },
  { player_name: "Kel'el Ware", accolade: 'All-Rookie Team', season: SEASON },

  // ── All-Star 2025 (24 selections) ─────────────────────────────────
  // East starters
  { player_name: 'Giannis Antetokounmpo', accolade: 'All-Star', season: SEASON },
  { player_name: 'Jayson Tatum', accolade: 'All-Star', season: SEASON },
  { player_name: 'Donovan Mitchell', accolade: 'All-Star', season: SEASON },
  { player_name: 'Jalen Brunson', accolade: 'All-Star', season: SEASON },
  { player_name: 'Karl-Anthony Towns', accolade: 'All-Star', season: SEASON },
  // East reserves
  { player_name: 'Damian Lillard', accolade: 'All-Star', season: SEASON },
  { player_name: 'Darius Garland', accolade: 'All-Star', season: SEASON },
  { player_name: 'Jaylen Brown', accolade: 'All-Star', season: SEASON },
  { player_name: 'Cade Cunningham', accolade: 'All-Star', season: SEASON },
  { player_name: 'Tyler Herro', accolade: 'All-Star', season: SEASON },
  { player_name: 'Evan Mobley', accolade: 'All-Star', season: SEASON },
  { player_name: 'Pascal Siakam', accolade: 'All-Star', season: SEASON },
  // West starters
  { player_name: 'Shai Gilgeous-Alexander', accolade: 'All-Star', season: SEASON },
  { player_name: 'LeBron James', accolade: 'All-Star', season: SEASON },
  { player_name: 'Nikola Jokic', accolade: 'All-Star', season: SEASON },
  { player_name: 'Kevin Durant', accolade: 'All-Star', season: SEASON },
  { player_name: 'Stephen Curry', accolade: 'All-Star', season: SEASON },
  // West reserves
  { player_name: 'Anthony Edwards', accolade: 'All-Star', season: SEASON },
  { player_name: 'Anthony Davis', accolade: 'All-Star', season: SEASON },
  { player_name: 'James Harden', accolade: 'All-Star', season: SEASON },
  { player_name: 'Jaren Jackson Jr.', accolade: 'All-Star', season: SEASON },
  { player_name: 'Alperen Sengun', accolade: 'All-Star', season: SEASON },
  { player_name: 'Jalen Williams', accolade: 'All-Star', season: SEASON },
  { player_name: 'Victor Wembanyama', accolade: 'All-Star', season: SEASON },
];

async function main() {
  console.log(`Inserting ${accolades.length} accolades for ${SEASON}...`);

  const BATCH = 50;
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
          console.error(`  Row error: ${row.player_name} ${row.accolade}: ${rowErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\nDone! Inserted ${inserted}/${accolades.length} accolades for ${SEASON}.`);
}

main().catch(console.error);
