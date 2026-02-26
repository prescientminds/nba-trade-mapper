/**
 * Scrape per-player WNBA playoff stats from Basketball-Reference.
 *
 * For each season, fetches:
 *   /wnba/playoffs/{YEAR}_per_game.html   → GP, PPG, RPG, APG
 *   /wnba/playoffs/{YEAR}_advanced.html   → WS, PER, BPM, VORP
 *
 * Upserts playoff columns into player_seasons by (player_name, team_id, season).
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-playoff-stats.ts             # All seasons
 *   npx tsx scripts/scrape-wnba-playoff-stats.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-wnba-playoff-stats.ts --dry-run   # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveWnbaTeamId } from './lib/wnba-team-resolver';

const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'playoff-stats');
const RATE_LIMIT_MS = 3100;
const FIRST_YEAR = 1997;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').trim();
}

function parseNum(s: string): number | null {
  const n = parseFloat(s);
  if (isNaN(n) || n < -999.99 || n > 999.99) return null;
  return n;
}

function getCachePath(year: number, type: string): string {
  return path.join(CACHE_DIR, `${year}_${type}.html`);
}

async function fetchPage(url: string, cachePath: string): Promise<string | null> {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf-8');
  console.log(`    Fetching ${url}`);
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (resp.status === 404) return null;
  if (resp.status === 429) { await sleep(60000); return fetchPage(url, cachePath); }
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, html);
  await sleep(RATE_LIMIT_MS);
  return html;
}

function parseTable(html: string, tableId: string): Record<string, string>[] {
  const $ = cheerio.load(html);
  const table = $(`#${tableId}`);
  if (!table.length) return [];
  const rows: Record<string, string>[] = [];
  table.find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;
    const playerCell = $tr.find('[data-stat="player"]');
    const playerName = playerCell.find('a').text().trim() || playerCell.text().trim();
    if (!playerName) return;
    const row: Record<string, string> = {};
    $tr.find('[data-stat]').each((_, td) => {
      const stat = $(td).attr('data-stat') || '';
      row[stat] = $(td).find('a').text().trim() || $(td).text().trim();
    });
    rows.push(row);
  });
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yearArg = args.find(a => a.startsWith('--year'));
  const singleYear = yearArg
    ? parseInt(yearArg.includes('=') ? yearArg.split('=')[1] : args[args.indexOf(yearArg) + 1])
    : null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const currentYear = new Date().getFullYear();
  const years = singleYear
    ? [singleYear]
    : Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

  console.log(`Scraping WNBA playoff stats for ${years.length} season(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const allRows: Array<{
    player_name: string;
    team_id: string;
    season: string;
    league: string;
    playoff_gp: number | null;
    playoff_ppg: number | null;
    playoff_rpg: number | null;
    playoff_apg: number | null;
    playoff_ws: number | null;
    playoff_per: number | null;
    playoff_bpm: number | null;
    playoff_vorp: number | null;
  }> = [];
  let skipped = 0;

  for (const year of years) {
    const season = String(year);
    console.log(`${season}:`);

    const advUrl = `https://www.basketball-reference.com/wnba/playoffs/${year}_advanced.html`;
    const advHtml = await fetchPage(advUrl, getCachePath(year, 'advanced'));

    const pgUrl = `https://www.basketball-reference.com/wnba/playoffs/${year}_per_game.html`;
    const pgHtml = await fetchPage(pgUrl, getCachePath(year, 'per_game'));

    if (!advHtml && !pgHtml) { console.log('  No data\n'); continue; }

    const advRows = advHtml ? parseTable(advHtml, 'advanced') : [];
    const advMap = new Map<string, Record<string, string>>();
    for (const row of advRows) {
      const name = cleanName(row.player || '');
      const team = row.team_id || row.team || '';
      if (name && team && team !== 'TOT') advMap.set(`${name}|${team}`, row);
    }

    const pgRows = pgHtml ? parseTable(pgHtml, 'per_game') : [];
    const pgMap = new Map<string, Record<string, string>>();
    for (const row of pgRows) {
      const name = cleanName(row.player || '');
      const team = row.team_id || row.team || '';
      if (name && team && team !== 'TOT') pgMap.set(`${name}|${team}`, row);
    }

    const allKeys = new Set([...advMap.keys(), ...pgMap.keys()]);
    let rowCount = 0;

    for (const key of allKeys) {
      const [playerName, bbrefTeam] = key.split('|');
      const teamId = resolveWnbaTeamId(bbrefTeam);
      if (!teamId) { skipped++; continue; }

      const adv = advMap.get(key) || {};
      const pg = pgMap.get(key) || {};

      allRows.push({
        player_name: playerName,
        team_id: teamId,
        season,
        league: 'WNBA',
        playoff_gp: parseNum(pg.g || adv.g || ''),
        playoff_ppg: parseNum(pg.pts_per_g || ''),
        playoff_rpg: parseNum(pg.trb_per_g || ''),
        playoff_apg: parseNum(pg.ast_per_g || ''),
        playoff_ws: parseNum(adv.ws || ''),
        playoff_per: parseNum(adv.per || ''),
        playoff_bpm: parseNum(adv.bpm || ''),
        playoff_vorp: parseNum(adv.vorp || ''),
      });
      rowCount++;
    }

    console.log(`  Players: ${rowCount}\n`);
  }

  console.log(`Total: ${allRows.length} (${skipped} unresolved)`);

  if (dryRun) {
    console.log('Dry run — no writes.');
    const top = allRows.filter(r => r.playoff_ws !== null).sort((a, b) => (b.playoff_ws ?? 0) - (a.playoff_ws ?? 0));
    console.log('\nTop 10 by playoff WS:');
    for (const r of top.slice(0, 10)) {
      console.log(`  ${r.player_name} (${r.team_id}, ${r.season}): WS=${r.playoff_ws} PPG=${r.playoff_ppg}`);
    }
    return;
  }

  console.log('Upserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_seasons')
      .upsert(batch, { onConflict: 'player_name,team_id,season' });
    if (error) { console.error(`Batch error: ${error.message}`); errors++; }
    else upserted += batch.length;
  }

  console.log(`Done! Upserted ${upserted} WNBA playoff stats (${errors} errors).`);
}

main().catch(console.error);
