/**
 * Scrape WNBA player per-game and advanced stats from Basketball-Reference.
 *
 * For each season, fetches:
 *   /wnba/years/{YEAR}_per_game.html   → GP, PPG, RPG, APG, FG%
 *   /wnba/years/{YEAR}_advanced.html   → Win Shares, PER, VORP
 *
 * Upserts to player_seasons with league='WNBA'.
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-player-stats.ts             # All seasons 1997–present
 *   npx tsx scripts/scrape-wnba-player-stats.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-wnba-player-stats.ts --dry-run   # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveWnbaTeamId } from './lib/wnba-team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'player-stats');
const RATE_LIMIT_MS = 3100;
const FIRST_YEAR = 1997;

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').trim();
}

function parseNum(s: string): number | null {
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n < -999.99 || n > 999.99) return null;
  return n;
}

function getCachePath(year: number, type: string): string {
  return path.join(CACHE_DIR, `${year}_${type}.html`);
}

async function fetchPage(url: string, cachePath: string): Promise<string | null> {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  console.log(`    Fetching ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (resp.status === 404) return null;
  if (resp.status === 429) {
    console.log('    Rate limited, waiting 60s...');
    await sleep(60000);
    return fetchPage(url, cachePath);
  }
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);

  const html = await resp.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, html);
  await sleep(RATE_LIMIT_MS);
  return html;
}

// ── Parser ───────────────────────────────────────────────────────────

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
      const link = $(td).find('a').text().trim();
      row[stat] = link || $(td).text().trim();
    });
    rows.push(row);
  });

  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────

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

  console.log(`Scraping WNBA player stats for ${years.length} season(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const allRows: Array<{
    player_name: string;
    team_id: string;
    season: string;
    league: string;
    gp: number | null;
    ppg: number | null;
    rpg: number | null;
    apg: number | null;
    fg_pct: number | null;
    win_shares: number | null;
    per: number | null;
    vorp: number | null;
  }> = [];
  let skipped = 0;

  for (const year of years) {
    const season = String(year);
    console.log(`${season}:`);

    // Fetch per-game stats
    const pgUrl = `https://www.basketball-reference.com/wnba/years/${year}_per_game.html`;
    const pgHtml = await fetchPage(pgUrl, getCachePath(year, 'per_game'));

    // Fetch advanced stats
    const advUrl = `https://www.basketball-reference.com/wnba/years/${year}_advanced.html`;
    const advHtml = await fetchPage(advUrl, getCachePath(year, 'advanced'));

    if (!pgHtml && !advHtml) {
      console.log('  No data\n');
      continue;
    }

    // Parse per-game table
    // Note: WNBA BBRef uses data-stat="team" (not "team_id") for the team column
    const pgRows = pgHtml ? parseTable(pgHtml, 'per_game') : [];
    const pgMap = new Map<string, Record<string, string>>();
    for (const row of pgRows) {
      const name = cleanName(row.player || '');
      const team = row.team_id || row.team || '';
      if (name && team && team !== 'TOT') pgMap.set(`${name}|${team}`, row);
    }

    // Parse advanced table
    const advRows = advHtml ? parseTable(advHtml, 'advanced') : [];
    const advMap = new Map<string, Record<string, string>>();
    for (const row of advRows) {
      const name = cleanName(row.player || '');
      const team = row.team_id || row.team || '';
      if (name && team && team !== 'TOT') advMap.set(`${name}|${team}`, row);
    }

    // Union all keys
    const allKeys = new Set([...pgMap.keys(), ...advMap.keys()]);
    let rowCount = 0;

    for (const key of allKeys) {
      const [playerName, bbrefTeam] = key.split('|');
      const teamId = resolveWnbaTeamId(bbrefTeam);
      if (!teamId) { skipped++; continue; }

      const pg = pgMap.get(key) || {};
      const adv = advMap.get(key) || {};

      allRows.push({
        player_name: playerName,
        team_id: teamId,
        season,
        league: 'WNBA',
        gp: parseNum(pg.g || adv.g || '') ,
        ppg: parseNum(pg.pts_per_g || ''),
        rpg: parseNum(pg.trb_per_g || ''),
        apg: parseNum(pg.ast_per_g || ''),
        fg_pct: parseNum(pg.fg_pct || ''),
        win_shares: parseNum(adv.ws || ''),
        per: parseNum(adv.per || ''),
        vorp: parseNum(adv.vorp || ''),
      });
      rowCount++;
    }

    console.log(`  Players: ${rowCount}\n`);
  }

  console.log(`Total rows: ${allRows.length} (${skipped} unresolved)`);

  if (dryRun) {
    console.log('Dry run — no database writes.');
    const sample = allRows.filter(r => r.win_shares !== null).sort((a, b) => (b.win_shares ?? 0) - (a.win_shares ?? 0));
    console.log('\nTop 10 by Win Shares:');
    for (const r of sample.slice(0, 10)) {
      console.log(`  ${r.player_name} (${r.team_id}, ${r.season}): WS=${r.win_shares} PPG=${r.ppg}`);
    }
    return;
  }

  // Upsert in batches
  console.log('Upserting to Supabase...');
  const BATCH = 500;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_seasons')
      .upsert(batch, { onConflict: 'player_name,team_id,season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }

    if ((i + BATCH) % 2000 === 0 || i + BATCH >= allRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH, allRows.length)}/${allRows.length}`);
    }
  }

  console.log(`\nDone! Upserted ${upserted} WNBA player-seasons (${errors} batch errors).`);
}

main().catch(console.error);
