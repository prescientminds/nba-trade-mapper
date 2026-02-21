/**
 * Scrape per-player playoff stats from Basketball-Reference.
 *
 * For each season, fetches two pages:
 *   NBA_{year}_advanced.html  → playoff_ws, playoff_per, playoff_bpm, playoff_vorp
 *   NBA_{year}_per_game.html  → playoff_gp, playoff_ppg, playoff_rpg, playoff_apg
 *
 * Upserts playoff columns into player_seasons by (player_name, team_id, season).
 * Regular-season columns are NOT touched.
 *
 * PREREQUISITE: Run database/migrations/005-playoff-stats.sql first.
 *   → Supabase SQL Editor: https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new
 *   → Or: SUPABASE_ACCESS_TOKEN=xxx npx tsx scripts/run-migrations-api.ts
 *
 * Usage:
 *   npx tsx scripts/scrape-playoff-stats.ts             # All seasons 1977–present
 *   npx tsx scripts/scrape-playoff-stats.ts --year 2022 # Single year
 *   npx tsx scripts/scrape-playoff-stats.ts --dry-run   # Parse only, no DB writes
 *   npx tsx scripts/scrape-playoff-stats.ts --overwrite # Re-fetch even if cached
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache', 'playoff-stats');
const RATE_LIMIT_MS = 3100;
const START_YEAR = 1977;

interface PlayerPlayoffRow {
  player_name: string;
  team_id: string;
  season: string;
  playoff_gp: number | null;
  playoff_ppg: number | null;
  playoff_rpg: number | null;
  playoff_apg: number | null;
  playoff_ws: number | null;
  playoff_per: number | null;
  playoff_bpm: number | null;
  playoff_vorp: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').trim();
}

function parseNum(s: string, min = -999.99, max = 999.99): number | null {
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // BBRef uses sentinel values like -1000 for players with negligible minutes
  if (n < min || n > max) return null;
  return n;
}

function bbrefSeasonToOurs(endYear: number): string {
  return `${endYear - 1}-${String(endYear).slice(2)}`;
}

function getCachePath(year: number, type: 'advanced' | 'per_game'): string {
  return path.join(CACHE_DIR, `NBA_${year}_${type}.html`);
}

async function fetchPage(url: string, cachePath: string, overwrite: boolean): Promise<string | null> {
  if (!overwrite && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  console.log(`    Fetching ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);

  const html = await resp.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, html);
  await sleep(RATE_LIMIT_MS);
  return html;
}

// ── Parsers ──────────────────────────────────────────────────────────

/**
 * Parse a BBRef stats table by id, returning rows as {data-stat → value} maps.
 * Skips header rows (thead) and subtotal/separator rows.
 */
function parseTable(html: string, tableId: string): Record<string, string>[] {
  const $ = cheerio.load(html);
  const table = $(`#${tableId}`);
  if (!table.length) return [];

  const rows: Record<string, string>[] = [];

  table.find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    // Skip header separator rows and rows without a player link
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

/**
 * Parse the advanced stats page.
 * Returns a map of "playerName|teamAbbr" → advanced stats.
 */
function parseAdvanced(html: string): Map<string, Record<string, string>> {
  const rows = parseTable(html, 'advanced_stats');
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const name = cleanName(row.player || '');
    const team = row.team_id || '';
    if (name && team && team !== 'TOT') {
      map.set(`${name}|${team}`, row);
    }
  }
  return map;
}

/**
 * Parse the per-game stats page.
 * Returns a map of "playerName|teamAbbr" → per-game stats.
 */
function parsePerGame(html: string): Map<string, Record<string, string>> {
  const rows = parseTable(html, 'per_game_stats');
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const name = cleanName(row.player || '');
    const team = row.team_id || '';
    if (name && team && team !== 'TOT') {
      map.set(`${name}|${team}`, row);
    }
  }
  return map;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const overwrite = args.includes('--overwrite');
  const yearArg = args.find(a => a.startsWith('--year'));
  const singleYear = yearArg
    ? parseInt(yearArg.includes('=') ? yearArg.split('=')[1] : args[args.indexOf(yearArg) + 1])
    : null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Pre-flight: verify playoff columns exist
  if (!dryRun) {
    const { error } = await supabase
      .from('player_seasons')
      .select('playoff_ws')
      .limit(1);

    if (error && error.message.includes('playoff_ws')) {
      console.error('ERROR: playoff_ws column does not exist in player_seasons.');
      console.error('Run this SQL in the Supabase dashboard first:');
      console.error('  https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new\n');
      console.error(fs.readFileSync(
        path.join(__dirname, '..', 'database', 'migrations', '005-playoff-stats.sql'),
        'utf-8'
      ));
      process.exit(1);
    }
  }

  const currentYear = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
  const years = singleYear
    ? [singleYear]
    : Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  console.log(`Scraping playoff stats for ${years.length} season(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const allRows: PlayerPlayoffRow[] = [];
  let skipped = 0;

  for (const year of years) {
    const season = bbrefSeasonToOurs(year);
    console.log(`${season} (${year}):`);

    const advUrl = `https://www.basketball-reference.com/playoffs/NBA_${year}_advanced.html`;
    const pgUrl = `https://www.basketball-reference.com/playoffs/NBA_${year}_per_game.html`;

    const [advHtml, pgHtml] = await Promise.all([
      // Only one is fetched at a time to respect rate limit; but if cached, both are instant
      fetchPage(advUrl, getCachePath(year, 'advanced'), overwrite),
      // Per-game may need its own rate-limited fetch — done sequentially below if needed
      null as null,
    ]);

    // Fetch per-game separately to avoid parallel HTTP requests violating rate limit
    const pgHtmlActual = fs.existsSync(getCachePath(year, 'per_game')) && !overwrite
      ? fs.readFileSync(getCachePath(year, 'per_game'), 'utf-8')
      : await fetchPage(pgUrl, getCachePath(year, 'per_game'), overwrite);

    if (!advHtml && !pgHtmlActual) {
      console.log('  No data (no playoffs or pre-merger season)\n');
      continue;
    }

    const advMap = advHtml ? parseAdvanced(advHtml) : new Map<string, Record<string, string>>();
    const pgMap = pgHtmlActual ? parsePerGame(pgHtmlActual) : new Map<string, Record<string, string>>();

    // Union of all player|team keys from both pages
    const allKeys = new Set([...advMap.keys(), ...pgMap.keys()]);

    let rowCount = 0;
    for (const key of allKeys) {
      const [playerName, bbrefTeam] = key.split('|');
      const teamId = resolveTeamId(bbrefTeam);

      if (!teamId) {
        skipped++;
        continue;
      }

      const adv = advMap.get(key) || {};
      const pg = pgMap.get(key) || {};

      // Games played — prefer per-game table (more reliable g count for playoffs)
      const gp = parseNum(pg.g || adv.g || '');

      const row: PlayerPlayoffRow = {
        player_name: playerName,
        team_id: teamId,
        season,
        playoff_gp:   gp,
        playoff_ppg:  parseNum(pg.pts_per_g || ''),
        playoff_rpg:  parseNum(pg.trb_per_g || ''),
        playoff_apg:  parseNum(pg.ast_per_g || ''),
        playoff_ws:   parseNum(adv.ws || ''),
        playoff_per:  parseNum(adv.per || ''),
        playoff_bpm:  parseNum(adv.bpm || ''),
        playoff_vorp: parseNum(adv.vorp || ''),
      };

      allRows.push(row);
      rowCount++;
    }

    console.log(`  Players: ${rowCount}`);

    if (dryRun && rowCount > 0) {
      // Show a few notable players (highest WS)
      const seasonRows = allRows.slice(-rowCount);
      const sorted = seasonRows
        .filter(r => r.playoff_ws !== null)
        .sort((a, b) => (b.playoff_ws ?? 0) - (a.playoff_ws ?? 0));
      console.log('  Top 3 by playoff WS:');
      for (const r of sorted.slice(0, 3)) {
        console.log(`    ${r.player_name} (${r.team_id}): WS=${r.playoff_ws} PPG=${r.playoff_ppg} GP=${r.playoff_gp}`);
      }
    }

    console.log();
  }

  console.log(`Total rows: ${allRows.length} (${skipped} team IDs unresolved)`);

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  // Upsert in batches — only playoff columns are set; regular-season cols untouched
  console.log('Upserting to Supabase...');
  const BATCH = 200;
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
  }

  console.log(`\nDone! Upserted ${upserted} playoff stat rows (${errors} batch errors).`);
}

main().catch(console.error);
