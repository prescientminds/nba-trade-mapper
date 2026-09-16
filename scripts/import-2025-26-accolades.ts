/**
 * One-time script to insert 2025-26 NBA accolades.
 * The Kaggle CSVs stop at the 2025-26 regular season stats (no awards), so these
 * are manually sourced from NBA.com official announcements, cross-checked against
 * Wikipedia's 2025–26 season page (2026-09-16).
 *
 * Player names match `player_seasons.player_name` for 2025-26 (diacritics kept:
 * Jokić, Dončić; "VJ Edgecombe", "OG Anunoby").
 *
 * Idempotent: deletes any existing 2025-26 rows before inserting.
 *
 * Usage: npx tsx scripts/import-2025-26-accolades.ts [--dry-run]
 */

import { supabase } from './lib/supabase-admin';

const SEASON = '2025-26';

const acc = (player_name: string, accolade: string) => ({ player_name, accolade, season: SEASON });

const accolades: Array<{ player_name: string; accolade: string; season: string }> = [
  // ── Individual Awards ──────────────────────────────────────────────
  acc('Shai Gilgeous-Alexander', 'MVP'),
  acc('Jalen Brunson', 'Finals MVP'),
  acc('Victor Wembanyama', 'DPOY'),
  acc('Cooper Flagg', 'ROY'),
  acc('Nickeil Alexander-Walker', 'MIP'),
  acc('Keldon Johnson', 'Sixth Man'),

  // ── All-NBA 1st Team ───────────────────────────────────────────────
  ...['Shai Gilgeous-Alexander', 'Victor Wembanyama', 'Cade Cunningham', 'Luka Dončić', 'Nikola Jokić']
    .map((p) => acc(p, 'All-NBA 1st Team')),
  // ── All-NBA 2nd Team ───────────────────────────────────────────────
  ...['Jaylen Brown', 'Jalen Brunson', 'Kevin Durant', 'Kawhi Leonard', 'Donovan Mitchell']
    .map((p) => acc(p, 'All-NBA 2nd Team')),
  // ── All-NBA 3rd Team ───────────────────────────────────────────────
  ...['Tyrese Maxey', 'Jamal Murray', 'Jalen Johnson', 'Chet Holmgren', 'Jalen Duren']
    .map((p) => acc(p, 'All-NBA 3rd Team')),

  // ── All-Defensive 1st Team ─────────────────────────────────────────
  ...['Victor Wembanyama', 'Chet Holmgren', 'Ausar Thompson', 'Rudy Gobert', 'Derrick White']
    .map((p) => acc(p, 'All-Defensive 1st Team')),
  // ── All-Defensive 2nd Team ─────────────────────────────────────────
  ...['Bam Adebayo', 'OG Anunoby', 'Scottie Barnes', 'Dyson Daniels', 'Cason Wallace']
    .map((p) => acc(p, 'All-Defensive 2nd Team')),

  // ── All-Rookie 1st + 2nd Teams (stored as one 'All-Rookie Team' accolade, per 2024-25) ──
  ...['Cooper Flagg', 'Kon Knueppel', 'VJ Edgecombe', 'Dylan Harper', 'Cedric Coward',
      'Ace Bailey', 'Jeremiah Fears', 'Collin Murray-Boyles', 'Maxime Raynaud', 'Derik Queen']
    .map((p) => acc(p, 'All-Rookie Team')),

  // ── All-Star 2026 (24 original selections + 4 commissioner/injury additions) ──
  ...[
    // West starters
    'Luka Dončić', 'Stephen Curry', 'Shai Gilgeous-Alexander', 'Nikola Jokić', 'Victor Wembanyama',
    // West reserves
    'Anthony Edwards', 'Jamal Murray', 'Chet Holmgren', 'Kevin Durant', 'Devin Booker', 'Deni Avdija', 'LeBron James',
    // East starters
    'Tyrese Maxey', 'Jalen Brunson', 'Cade Cunningham', 'Jaylen Brown', 'Giannis Antetokounmpo',
    // East reserves
    'Donovan Mitchell', 'Jalen Johnson', 'Karl-Anthony Towns', 'Pascal Siakam', 'Norman Powell', 'Scottie Barnes', 'Jalen Duren',
    // Additions (Leonard added by commissioner to reach the 16-USA minimum; Fox, Ingram, Şengün injury replacements)
    'Kawhi Leonard', "De'Aaron Fox", 'Brandon Ingram', 'Alperen Şengün',
  ].map((p) => acc(p, 'All-Star')),
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`${accolades.length} accolades for ${SEASON}`);
  if (dryRun) { for (const a of accolades) console.log(`  ${a.accolade.padEnd(24)} ${a.player_name}`); return; }

  const { error: delErr, count } = await supabase
    .from('player_accolades').delete({ count: 'exact' }).eq('season', SEASON);
  if (delErr) { console.error(`Delete failed: ${delErr.message}`); process.exit(1); }
  console.log(`Cleared ${count ?? 0} existing ${SEASON} rows.`);

  const { error } = await supabase.from('player_accolades').insert(accolades);
  if (error) { console.error(`Insert failed: ${error.message}`); process.exit(1); }
  console.log(`Inserted ${accolades.length} accolades for ${SEASON}.`);

  // Verify every name resolves to a 2025-26 player_seasons row
  const names = [...new Set(accolades.map((a) => a.player_name))];
  const { data } = await supabase.from('player_seasons').select('player_name').eq('season', SEASON).in('player_name', names);
  const found = new Set((data ?? []).map((r) => r.player_name));
  const missing = names.filter((n) => !found.has(n));
  console.log(missing.length ? `WARNING — no 2025-26 player_seasons match for: ${missing.join(', ')}` : 'All names match player_seasons.');
}

main().catch((e) => { console.error(e); process.exit(1); });
