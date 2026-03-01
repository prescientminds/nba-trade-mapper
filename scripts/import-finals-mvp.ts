/**
 * Import NBA Finals MVP accolades into player_accolades.
 *
 * The Finals MVP award has been given since 1969.
 * This data is NOT in the Kaggle datasets — it must be hardcoded.
 *
 * Usage:
 *   npx tsx scripts/import-finals-mvp.ts            # Insert Finals MVP entries
 *   npx tsx scripts/import-finals-mvp.ts --dry-run   # Print entries, no DB writes
 */

import { supabase } from './lib/supabase-admin';

// ── Finals MVP winners ───────────────────────────────────────────────────────
// Format: [season, player_name]
// Season = "YYYY-YY" format matching our schema

const FINALS_MVP_WINNERS: [string, string][] = [
  // Pre-merger (1969-1976) — included for completeness, won't affect trade scoring
  ['1968-69', 'Jerry West'],
  ['1969-70', 'Willis Reed'],
  ['1970-71', 'Kareem Abdul-Jabbar'],  // Was "Lew Alcindor" at the time; BBRef uses Kareem
  ['1971-72', 'Wilt Chamberlain'],
  ['1972-73', 'Willis Reed'],
  ['1973-74', 'John Havlicek'],
  ['1974-75', 'Rick Barry'],
  ['1975-76', 'Jo Jo White'],

  // Post-merger (1977+)
  ['1976-77', 'Bill Walton'],
  ['1977-78', 'Wes Unseld'],
  ['1978-79', 'Dennis Johnson'],
  ['1979-80', 'Magic Johnson'],
  ['1980-81', 'Cedric Maxwell'],
  ['1981-82', 'Magic Johnson'],
  ['1982-83', 'Moses Malone'],
  ['1983-84', 'Larry Bird'],
  ['1984-85', 'Kareem Abdul-Jabbar'],
  ['1985-86', 'Larry Bird'],
  ['1986-87', 'Magic Johnson'],
  ['1987-88', 'James Worthy'],
  ['1988-89', 'Joe Dumars'],
  ['1989-90', 'Isiah Thomas'],
  ['1990-91', 'Michael Jordan'],
  ['1991-92', 'Michael Jordan'],
  ['1992-93', 'Michael Jordan'],
  ['1993-94', 'Hakeem Olajuwon'],
  ['1994-95', 'Hakeem Olajuwon'],
  ['1995-96', 'Michael Jordan'],
  ['1996-97', 'Michael Jordan'],
  ['1997-98', 'Michael Jordan'],
  ['1998-99', 'Tim Duncan'],
  ['1999-00', 'Shaquille O\'Neal'],
  ['2000-01', 'Shaquille O\'Neal'],
  ['2001-02', 'Shaquille O\'Neal'],
  ['2002-03', 'Tim Duncan'],
  ['2003-04', 'Chauncey Billups'],
  ['2004-05', 'Tim Duncan'],
  ['2005-06', 'Dwyane Wade'],
  ['2006-07', 'Tony Parker'],
  ['2007-08', 'Paul Pierce'],
  ['2008-09', 'Kobe Bryant'],
  ['2009-10', 'Kobe Bryant'],
  ['2010-11', 'Dirk Nowitzki'],
  ['2011-12', 'LeBron James'],
  ['2012-13', 'LeBron James'],
  ['2013-14', 'Kawhi Leonard'],
  ['2014-15', 'Andre Iguodala'],
  ['2015-16', 'LeBron James'],
  ['2016-17', 'Kevin Durant'],
  ['2017-18', 'Kevin Durant'],
  ['2018-19', 'Kawhi Leonard'],
  ['2019-20', 'LeBron James'],
  ['2020-21', 'Giannis Antetokounmpo'],
  ['2021-22', 'Stephen Curry'],
  ['2022-23', 'Nikola Jokic'],
  ['2023-24', 'Jaylen Brown'],
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const entries = FINALS_MVP_WINNERS.map(([season, player_name]) => ({
    player_name,
    accolade: 'Finals MVP',
    season,
  }));

  console.log(`Finals MVP entries to import: ${entries.length}`);

  if (dryRun) {
    for (const e of entries) {
      console.log(`  ${e.season}  ${e.player_name}`);
    }
    console.log('\nDry run — no database writes.');
    return;
  }

  // Delete existing Finals MVP entries to prevent duplicates
  const { error: deleteError } = await supabase
    .from('player_accolades')
    .delete()
    .eq('accolade', 'Finals MVP');

  if (deleteError) {
    console.error(`Failed to delete existing Finals MVP entries: ${deleteError.message}`);
    return;
  }
  console.log('Cleared existing Finals MVP entries.');

  // Insert fresh
  const { error: insertError } = await supabase
    .from('player_accolades')
    .insert(entries);

  if (insertError) {
    console.error(`Insert error: ${insertError.message}`);
    return;
  }

  console.log(`Done! Inserted ${entries.length} Finals MVP accolades.`);
}

main().catch(console.error);
