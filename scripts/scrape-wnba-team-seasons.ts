/**
 * Scrape WNBA team season records (W/L) from Basketball-Reference.
 *
 * URL pattern: https://www.basketball-reference.com/wnba/years/{YEAR}.html
 *
 * Extracts standings tables for each season and upserts to team_seasons
 * with league='WNBA'.
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-team-seasons.ts             # All seasons
 *   npx tsx scripts/scrape-wnba-team-seasons.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-wnba-team-seasons.ts --dry-run   # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveWnbaTeamId } from './lib/wnba-team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'seasons');
const RATE_LIMIT_MS = 3100;
const FIRST_YEAR = 1997;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getCachePath(year: number): string {
  return path.join(CACHE_DIR, `${year}.html`);
}

async function fetchPage(url: string, cachePath: string): Promise<string | null> {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }
  console.log(`  Fetching ${url}`);
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

// ── Parser ───────────────────────────────────────────────────────────

interface TeamSeasonRow {
  team_id: string;
  season: string;
  league: string;
  wins: number | null;
  losses: number | null;
  playoff_result: string | null;
  championship: boolean;
}

function parseStandings(html: string, year: number): TeamSeasonRow[] {
  const $ = cheerio.load(html);
  const season = String(year);
  const results: TeamSeasonRow[] = [];

  // BBRef WNBA standings tables have data-stat attributes
  // Look for standings tables (Eastern/Western or single standings)
  const tableIds = ['standings_e', 'standings_w', 'standings', 'confs_standings_E', 'confs_standings_W'];

  for (const tableId of tableIds) {
    const table = $(`#${tableId}`);
    if (!table.length) continue;

    table.find('tbody tr').each((_, tr) => {
      const $tr = $(tr);
      if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

      // Team name from link or text
      const teamCell = $tr.find('[data-stat="team_name"]');
      const teamLink = teamCell.find('a');
      let teamAbbr: string | null = null;

      if (teamLink.length) {
        const href = teamLink.attr('href') || '';
        const m = href.match(/\/wnba\/teams\/([A-Z]{2,3})\//);
        if (m) teamAbbr = m[1];
      }

      if (!teamAbbr) return;

      const teamId = resolveWnbaTeamId(teamAbbr);
      if (!teamId) return;

      const wins = parseInt($tr.find('[data-stat="wins"]').text()) || null;
      const losses = parseInt($tr.find('[data-stat="losses"]').text()) || null;

      results.push({
        team_id: teamId,
        season,
        league: 'WNBA',
        wins,
        losses,
        playoff_result: null, // Filled by scrape-wnba-playoffs.ts
        championship: false,
      });
    });
  }

  return results;
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

  console.log(`Scraping WNBA team seasons for ${years.length} year(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const allRows: TeamSeasonRow[] = [];

  for (const year of years) {
    console.log(`${year}:`);
    const url = `https://www.basketball-reference.com/wnba/years/${year}.html`;
    const html = await fetchPage(url, getCachePath(year));

    if (!html) { console.log('  No data\n'); continue; }

    const rows = parseStandings(html, year);
    console.log(`  Teams: ${rows.length}`);

    if (dryRun && rows.length > 0) {
      for (const r of rows) {
        console.log(`    ${r.team_id}: ${r.wins}-${r.losses}`);
      }
    }

    allRows.push(...rows);
    console.log();
  }

  console.log(`Total: ${allRows.length} team-season rows`);

  if (dryRun) { console.log('Dry run — no writes.'); return; }

  // Upsert
  console.log('Upserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('team_seasons')
      .upsert(batch, { onConflict: 'team_id,season' });

    if (error) { console.error(`Batch error: ${error.message}`); errors++; }
    else upserted += batch.length;
  }

  console.log(`Done! Upserted ${upserted} WNBA team-seasons (${errors} errors).`);
}

main().catch(console.error);
