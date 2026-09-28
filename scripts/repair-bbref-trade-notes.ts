/**
 * One-time repair (issue #45 + trailing-notes bug) for BBRef-era trades
 * already in public/data/trades/by-season/.
 *
 * CSV-era trades (pre-2019) get only correction 2.
 *
 * Re-parses each trade from the cached BBRef day pages with the fixed parser
 * and applies only the three corrections that parser fix makes — so earlier
 * hand fixes and enrich-picks results elsewhere in a trade are untouched:
 *   1. picks the notes mark as swaps → type 'swap', no conveyed player
 *   2. "players" that are note text (e.g. "did not convey") → removed
 *   3. players/picks dropped because notes broke the last clause → added
 *
 * Usage:
 *   npx tsx scripts/repair-bbref-trade-notes.ts            # dry run, prints every change
 *   npx tsx scripts/repair-bbref-trade-notes.ts --write    # apply
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { parseTradeText, isNoteFragment, fixDiacritics, type StaticTrade, type StaticTradeAsset } from './lib/bbref-parser';

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data', 'bbref-cache');
const SEASON_DIR = path.join(ROOT, 'public', 'data', 'trades', 'by-season');
const write = process.argv.includes('--write');

const fold = (s: string | null | undefined) =>
  fixDiacritics(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const teamKey = (t: StaticTrade) => t.teams.map((x) => x.team_id).sort().join(',');

// Fresh parse of every cached BBRef trade, keyed like the stored files.
const reparsed = new Map<string, StaticTrade>();
for (const f of fs.readdirSync(CACHE).filter((f) => /^\d+-\d+\.html$/.test(f))) {
  const $ = cheerio.load(fs.readFileSync(path.join(CACHE, f), 'utf-8'));
  $('ul.page_index > li').each((_, li) => {
    const d = new Date($(li).find('p > strong').first().text().trim());
    if (isNaN(d.getTime())) return;
    const ds = d.toISOString().split('T')[0];
    $(li).find('p.transaction').each((_, p) => {
      if (!$(p).text().toLowerCase().includes('traded')) return;
      for (const t of parseTradeText($, p, d.getFullYear())) reparsed.set(`${ds}|${teamKey(t)}`, t);
    });
  });
}

let swaps = 0, removed = 0, added = 0, tradesTouched = 0;
const log: string[] = [];

for (const file of fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const fp = path.join(SEASON_DIR, file);
  const trades: StaticTrade[] = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  let fileChanged = false;

  for (const t of trades) {
    if (!t.id.startsWith('bbref-')) {
      // CSV-era trades: same note-as-player junk ("trade exception"); removal only.
      const before = log.length;
      t.assets = t.assets.filter((a) => {
        if (a.type === 'player' && a.player_name && isNoteFragment(a.player_name)) {
          log.push(`  - ${t.date} removed note-as-player "${a.player_name.slice(0, 70)}" (CSV era)`);
          removed++;
          return false;
        }
        return true;
      });
      if (log.length > before) { tradesTouched++; fileChanged = true; }
      continue;
    }
    const fresh = reparsed.get(`${t.date}|${teamKey(t)}`);
    if (!fresh) continue;
    const before = log.length;

    // 2. note text stored as a player
    t.assets = t.assets.filter((a) => {
      if (a.type === 'player' && a.player_name && isNoteFragment(a.player_name)) {
        log.push(`  - ${t.date} removed note-as-player "${a.player_name.slice(0, 70)}"`);
        removed++;
        return false;
      }
      return true;
    });

    // 1. swaps
    for (const fa of fresh.assets.filter((a) => a.type === 'swap' && a.pick_round)) {
      const hit = t.assets.find((a) => a.type === 'pick' && a.pick_year === fa.pick_year && a.pick_round === fa.pick_round
        && a.from_team_id === fa.from_team_id && a.to_team_id === fa.to_team_id);
      if (!hit) continue;
      log.push(`  ~ ${t.date} ${hit.pick_year} R${hit.pick_round} ${hit.from_team_id}>${hit.to_team_id} pick→swap${hit.became_player_name ? ` (dropped "${hit.became_player_name}")` : ''}`);
      hit.type = 'swap'; hit.became_player_name = null; hit.notes = fa.notes;
      swaps++;
    }

    // 3. assets the old parse dropped
    const has = (fa: StaticTradeAsset) => t.assets.some((a) =>
      fa.type === 'player'
        ? a.type === 'player' && fold(a.player_name) === fold(fa.player_name)
        : (a.type === 'pick' || a.type === 'swap') && a.pick_year === fa.pick_year && a.pick_round === fa.pick_round
          && a.from_team_id === fa.from_team_id && a.to_team_id === fa.to_team_id);
    for (const fa of fresh.assets) {
      if (fa.type !== 'player' && fa.type !== 'pick' && fa.type !== 'swap') continue;
      if (fa.type !== 'player' && !fa.pick_round) continue;
      if (has(fa)) continue;
      t.assets.push({ ...fa });
      log.push(`  + ${t.date} added ${fa.type} ${fa.player_name ?? `${fa.pick_year} R${fa.pick_round}`} ${fa.from_team_id}>${fa.to_team_id}`);
      added++;
    }

    if (log.length > before) { tradesTouched++; fileChanged = true; }
  }
  if (fileChanged && write) fs.writeFileSync(fp, JSON.stringify(trades, null, 2));
}

console.log(log.join('\n'));
console.log(`\n${tradesTouched} trades: ${swaps} picks→swaps, ${removed} note fragments removed, ${added} assets added.`);
console.log(write ? 'Written.' : 'Dry run — pass --write to apply.');
