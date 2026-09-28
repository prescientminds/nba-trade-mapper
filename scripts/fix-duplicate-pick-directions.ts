/**
 * One-time fix for GitHub issue #45, Category A: a pick stored in BOTH
 * directions between the same two teams in one trade, each resolved to the
 * same drafted player. One copy is a parsing duplicate.
 *
 * Keep-direction rule, decided per trade and listed explicitly below:
 *   - the direction whose receiving team drafted the player (drafts.json), or
 *   - for BBRef-era trades, the direction the trade text states.
 * Andy Rautins (2008-07-15) is excluded: neither team drafted him, so the
 * data can't decide — it goes to the manual review list.
 *
 * Usage:
 *   npx tsx scripts/fix-duplicate-pick-directions.ts           # dry run
 *   npx tsx scripts/fix-duplicate-pick-directions.ts --write
 */

import * as fs from 'fs';
import * as path from 'path';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const write = process.argv.includes('--write');

// [trade date, drafted player, direction to REMOVE as "FROM>TO"]
const FIXES: [string, string, string][] = [
  ['1977-06-07', 'Marques Johnson', 'LAC>MIL'],
  ['1978-06-07', 'Mychal Thompson', 'POR>IND'],
  ['1980-08-15', 'Clyde Drexler', 'POR>DEN'],
  ['1982-06-28', 'Richard Anderson', 'LAC>HOU'],
  ['1983-06-29', 'Steve Alford', 'DAL>BKN'],
  ['1986-11-11', 'Scottie Pippen', 'OKC>NYK'],
  ['1990-06-22', 'Willie Burton', 'MIA>DEN'],
  ['1991-06-11', 'Mark Macon', 'DEN>WAS'],
  ['1995-06-14', 'George Banks', 'MIA>CLE'],
  ['1996-06-21', 'Antoine Walker', 'BOS>DAL'],
  ['1996-07-16', 'Ruben Patterson', 'LAL>MEM'],
  ['1997-05-27', 'Ben Pepper', 'BOS>MIA'],
  ['2003-08-05', 'Ricky Minard', 'SAC>UTA'],
  ['2006-07-14', 'Maarty Leunen', 'HOU>NOP'],
  ['2008-08-06', 'Chandler Parsons', 'HOU>LAC'],
  ['2009-06-24', 'Byron Mullens', 'DAL>POR'],
  ['2012-07-11', 'Cheick Diallo', 'LAC>BKN'],
  // BBRef era: text says "The Utah Jazz traded … to the New York Knicks".
  ['2020-11-22', 'Mouhamed Gueye', 'NYK>UTA'],
  ['2020-11-22', 'Ajay Mitchell', 'NYK>UTA'],
  // "The Milwaukee Bucks traded a 2024 2nd round draft pick … to the Memphis Grizzlies".
  ['2021-08-07', 'Cam Christie', 'MEM>MIL'],
];

let removed = 0, cleared = 0;
for (const file of fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const fp = path.join(SEASON_DIR, file);
  const trades = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  let changed = false;
  for (const t of trades) {
    for (const [date, player, dir] of FIXES) {
      if (t.date !== date) continue;
      const [from, to] = dir.split('>');
      const pair = t.assets.filter((a: any) => (a.type === 'pick' || a.type === 'swap') && a.became_player_name === player);
      const drop = pair.find((a: any) => a.from_team_id === from && a.to_team_id === to);
      if (pair.length !== 2 || !drop) continue; // only act on the exact duplicate
      t.assets = t.assets.filter((a: any) => a !== drop);
      console.log(`  - ${date} ${player}: removed ${dir} copy (kept ${to}>${from})`);
      removed++; changed = true;
    }
    // 2026-07-06 HOU/CHA: both 2033 2nds are real; "cash" was stored as the draftee.
    for (const a of t.assets) {
      if ((a.type === 'pick' || a.type === 'swap') && a.became_player_name === 'cash') {
        console.log(`  ~ ${t.date} cleared draftee "cash" on ${a.pick_year} R${a.pick_round} ${a.from_team_id}>${a.to_team_id}`);
        a.became_player_name = null; cleared++; changed = true;
      }
    }
  }
  if (changed && write) fs.writeFileSync(fp, JSON.stringify(trades, null, 2));
}
console.log(`\n${removed} duplicate picks removed, ${cleared} bogus draftees cleared.`);
console.log(write ? 'Written.' : 'Dry run — pass --write to apply.');
