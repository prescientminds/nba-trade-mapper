/**
 * GitHub issue #45, Category B: in trades where the same (year, round) pick
 * is listed going both ways, a draftee is credited to a side that never got
 * him — the receiving team didn't draft him and our data shows no later trade
 * sending that pick on (the Kuzma case). Clearing the draftee removes the false
 * chain branch and keeps the pick movement itself.
 *
 * A side was kept when the receiving team drafted the player, or a later
 * trade moves the same pick onward from that team (e.g. Tatum: SAC→PHI 2015,
 * PHI→BOS 2017). Each cleared entry is marked with NO_DRAFTEE_NOTE so
 * enrich-picks never refills it.
 *
 * Usage:
 *   npx tsx scripts/fix-phantom-draftees.ts           # dry run
 *   npx tsx scripts/fix-phantom-draftees.ts --write
 */

import * as fs from 'fs';
import * as path from 'path';
import { NO_DRAFTEE_NOTE } from './lib/bbref-parser';

const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const write = process.argv.includes('--write');

// [trade date, pick year, round, "FROM>TO", credited draftee, why he is not this team's]
const FIXES: [string, number, number, string, string, string][] = [
  ['1977-01-20', 1977, 1, 'WAS>ATL', "Bo Ellis", 'drafted by WAS'],
  ['1980-06-10', 1981, 1, 'POR>CHI', "Jeff Lamp", 'drafted by POR'],
  ['1986-01-14', 1988, 2, 'LAC>POR', "Tom Garrick", 'drafted by LAC'],
  ['1986-01-14', 1988, 2, 'POR>LAC', "Rolando Ferreira", 'drafted by POR'],
  ['1987-06-22', 1989, 1, 'OKC>CHI', "Kenny Payne", 'drafted by PHI'],
  ['1987-06-22', 1989, 1, 'CHI>OKC', "B. J. Armstrong", 'drafted by CHI'],
  ['1988-02-25', 1988, 1, 'PHX>CLE', "Tim Perry", 'drafted by PHX'],
  ['1993-09-01', 1994, 1, 'OKC>CHA', "Brooks Thompson", 'drafted by ORL'],
  ['1993-09-03', 1994, 1, 'CHA>PHI', "Carlos Rogers", 'drafted by OKC'],
  ['1993-09-03', 1994, 1, 'PHI>CHA', "Sharone Wright", 'drafted by PHI'],
  ['1993-10-01', 1996, 1, 'DET>SAS', "John Wallace", 'drafted by NYK'],
  ['1994-07-29', 1998, 1, 'ORL>WAS', "Michael Doleac", 'drafted by ORL'],
  ['2000-11-26', 2002, 2, 'HOU>MIA', "Dan Gadzuric", 'drafted by MIL'],
  ['2008-07-15', 2010, 2, 'DEN>LAC', "Andy Rautins", 'drafted by NYK'],
  ['2008-07-15', 2010, 2, 'LAC>DEN', "Andy Rautins", 'drafted by NYK'],
  ['2010-06-21', 2010, 2, 'POR>GSW', "Jerome Jordan", 'drafted by MIL'],
  ['2011-02-22', 2016, 1, 'DEN>NYK', "Jakob Pöltl", 'drafted by TOR'],
  ['2013-07-12', 2019, 2, 'SAC>MIL', "Admiral Schofield", 'drafted by PHI'],
  ['2014-10-27', 2018, 2, 'PHI>NYK', "Ray Spalding", 'drafted by PHI'],
  ['2014-12-11', 2018, 2, 'PHI>BKN', "Ray Spalding", 'drafted by PHI'],
  ['2017-02-22', 2017, 2, 'PHI>ATL', "Frank Mason III", 'drafted by SAC'],
  ['2017-06-20', 2017, 2, 'ATL>CHA', "Mathias Lessort", 'drafted by PHI'],
  ['2018-02-08', 2022, 2, 'CHI>DET', "Isaiah Mobley", 'drafted by CLE'],
  ['2018-02-08', 2022, 2, 'DET>CHI', "Christian Koloko", 'drafted by TOR'],
  ['2018-12-07', 2021, 2, 'CLE>MIL', "Herbert Jones", 'drafted by NOP'],
  ['2018-12-07', 2021, 2, 'MIL>CLE', "Sandro Mamukelashvili", 'drafted by IND'],
  ['2021-03-22', 2022, 2, 'LAC>SAC', "Moussa Diabaté", 'drafted by LAC'],
  ['2021-03-22', 2022, 2, 'SAC>LAC', "Jaden Hardy", 'drafted by SAC'],
  ['2021-08-07', 2023, 2, 'IND>SAS', "Jordan Walsh", 'drafted by SAC'],
  ['2021-08-07', 2023, 2, 'SAS>IND', "Leonard Miller", 'drafted by SAS'],
  ['2025-07-06', 2026, 2, 'BKN>HOU', "Isaiah Evans", 'drafted by MIN'],
  ['2025-07-06', 2026, 2, 'HOU>BKN', "Ugonna Onyenso", 'drafted by DET'],
];

let cleared = 0;
for (const file of fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const fp = path.join(SEASON_DIR, file);
  const trades = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  let changed = false;
  for (const t of trades) {
    for (const [date, year, round, dir, player, why] of FIXES) {
      if (t.date !== date) continue;
      const [from, to] = dir.split('>');
      for (const a of t.assets) {
        if ((a.type !== 'pick' && a.type !== 'swap') || a.pick_year !== year || a.pick_round !== round) continue;
        if (a.from_team_id !== from || a.to_team_id !== to || a.became_player_name !== player) continue;
        a.became_player_name = null;
        a.notes = `${NO_DRAFTEE_NOTE} ${player} (${why})`;
        console.log(`  ~ ${date} ${year} R${round} ${dir}: cleared "${player}" (${why})`);
        cleared++; changed = true;
      }
    }
  }
  if (changed && write) fs.writeFileSync(fp, JSON.stringify(trades, null, 2));
}
console.log(`\n${cleared} phantom draftees cleared.`);
console.log(write ? 'Written.' : 'Dry run — pass --write to apply.');
