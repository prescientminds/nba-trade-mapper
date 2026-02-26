/**
 * Scrape WNBA player accolades from Basketball-Reference awards pages.
 *
 * Fetches:
 *   /wnba/awards/mvp.html         → MVP
 *   /wnba/awards/dpoy.html        → DPOY
 *   /wnba/awards/roy.html         → ROY
 *   /wnba/awards/mip.html         → MIP
 *   /wnba/awards/sixth_woman.html → Sixth Player
 *   /wnba/awards/all_wnba.html    → All-WNBA 1st/2nd Team
 *   /wnba/awards/all_defense.html → All-Defensive 1st/2nd Team
 *   /wnba/awards/all_rookie.html  → All-Rookie Team
 *   + All-Star scraping from season pages
 *
 * Inserts to player_accolades with league='WNBA'.
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-accolades.ts           # Scrape all awards
 *   npx tsx scripts/scrape-wnba-accolades.ts --dry-run # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'awards');
const RATE_LIMIT_MS = 3100;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').trim();
}

async function fetchPage(url: string, cachePath: string): Promise<string | null> {
  if (fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf-8');
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

interface Accolade {
  player_name: string;
  accolade: string;
  season: string;
  league: string;
}

// ── Award page parsers ──────────────────────────────────────────────

/**
 * Parse a single-winner award page (MVP, DPOY, ROY, MIP, Sixth Player).
 * These pages have a table with one row per season.
 */
function parseSingleWinnerAward(html: string, awardName: string): Accolade[] {
  const $ = cheerio.load(html);
  const results: Accolade[] = [];

  // Find the main awards table
  $('table').find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

    // Season column — may be "season" or "year_id" data-stat
    const seasonCell = $tr.find('[data-stat="season"], [data-stat="year_id"]');
    const seasonText = seasonCell.text().trim();

    // Player column
    const playerCell = $tr.find('[data-stat="player"]');
    const playerName = playerCell.find('a').text().trim() || playerCell.text().trim();

    if (!playerName || !seasonText) return;

    // WNBA season format on BBRef: "2024" or "2023-24"
    // We store as single year
    const yearMatch = seasonText.match(/(\d{4})/);
    if (!yearMatch) return;

    // For WNBA awards pages, the year shown is the actual season year
    const season = yearMatch[1];

    results.push({
      player_name: cleanName(playerName),
      accolade: awardName,
      season,
      league: 'WNBA',
    });
  });

  return results;
}

/**
 * Parse an All-Team award page (All-WNBA, All-Defensive, All-Rookie).
 * These pages list multiple players per season, organized by team (1st, 2nd).
 */
function parseAllTeamAward(html: string, awardPrefix: string): Accolade[] {
  const $ = cheerio.load(html);
  const results: Accolade[] = [];

  $('table').find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

    const seasonCell = $tr.find('[data-stat="season"], [data-stat="year_id"]');
    const seasonText = seasonCell.text().trim();
    const yearMatch = seasonText.match(/(\d{4})/);
    if (!yearMatch) return;
    const season = yearMatch[1];

    // Team number (1st, 2nd)
    const tmCell = $tr.find('[data-stat="number_tm"], [data-stat="count"]');
    const tmText = tmCell.text().trim();

    const playerCell = $tr.find('[data-stat="player"]');
    const playerName = playerCell.find('a').text().trim() || playerCell.text().trim();
    if (!playerName) return;

    // Determine team designation
    let teamLabel = '';
    if (/1st|first|1/i.test(tmText)) teamLabel = '1st';
    else if (/2nd|second|2/i.test(tmText)) teamLabel = '2nd';

    const accolade = teamLabel
      ? `${awardPrefix} ${teamLabel} Team`
      : `${awardPrefix} Team`;

    results.push({
      player_name: cleanName(playerName),
      accolade,
      season,
      league: 'WNBA',
    });
  });

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const allAccolades: Accolade[] = [];
  const seen = new Set<string>();

  function addAccolade(a: Accolade) {
    const key = `${a.player_name}|${a.accolade}|${a.season}`;
    if (seen.has(key)) return;
    seen.add(key);
    allAccolades.push(a);
  }

  // 1. Single-winner awards
  const singleAwards: [string, string, string][] = [
    ['mvp.html', 'MVP', 'MVP'],
    ['dpoy.html', 'DPOY', 'DPOY'],
    ['roy.html', 'ROY', 'ROY'],
    ['mip.html', 'MIP', 'MIP'],
    ['sixth_woman.html', 'Sixth Player', 'Sixth Player'],
  ];

  for (const [page, award, label] of singleAwards) {
    const url = `https://www.basketball-reference.com/wnba/awards/${page}`;
    const cachePath = path.join(CACHE_DIR, page);
    const html = await fetchPage(url, cachePath);
    if (html) {
      const results = parseSingleWinnerAward(html, award);
      console.log(`${label}: ${results.length} winners`);
      results.forEach(addAccolade);
    }
  }

  // 2. All-Team awards
  const teamAwards: [string, string, string][] = [
    ['all_wnba.html', 'All-WNBA', 'All-WNBA'],
    ['all_defense.html', 'All-Defensive', 'All-Defensive'],
    ['all_rookie.html', 'All-Rookie', 'All-Rookie'],
  ];

  for (const [page, prefix, label] of teamAwards) {
    const url = `https://www.basketball-reference.com/wnba/awards/${page}`;
    const cachePath = path.join(CACHE_DIR, page);
    const html = await fetchPage(url, cachePath);
    if (html) {
      const results = parseAllTeamAward(html, prefix);
      console.log(`${label}: ${results.length} selections`);
      results.forEach(addAccolade);
    }
  }

  // 3. All-Star selections — these may be on individual season pages
  // BBRef may have /wnba/allstar/WNBA_{YEAR}.html or similar
  const allStarUrl = 'https://www.basketball-reference.com/wnba/allstar/';
  const allStarCachePath = path.join(CACHE_DIR, 'allstar_index.html');
  const allStarHtml = await fetchPage(allStarUrl, allStarCachePath);
  if (allStarHtml) {
    const $ = cheerio.load(allStarHtml);
    // Parse All-Star game entries — structure varies
    $('table').find('tbody tr').each((_, tr) => {
      const $tr = $(tr);
      if ($tr.hasClass('thead')) return;

      const seasonCell = $tr.find('[data-stat="season"], [data-stat="year_id"]');
      const seasonText = seasonCell.text().trim();
      const yearMatch = seasonText.match(/(\d{4})/);
      if (!yearMatch) return;

      const playerCell = $tr.find('[data-stat="player"]');
      const playerName = playerCell.find('a').text().trim() || playerCell.text().trim();
      if (!playerName) return;

      addAccolade({
        player_name: cleanName(playerName),
        accolade: 'All-Star',
        season: yearMatch[1],
        league: 'WNBA',
      });
    });
    console.log(`All-Star: ${allAccolades.filter(a => a.accolade === 'All-Star').length} selections`);
  }

  console.log(`\nTotal unique accolades: ${allAccolades.length}`);

  if (dryRun) {
    console.log('Dry run — no writes.');
    // Summary by type
    const byType = new Map<string, number>();
    for (const a of allAccolades) {
      byType.set(a.accolade, (byType.get(a.accolade) || 0) + 1);
    }
    for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${type}: ${count}`);
    }
    return;
  }

  // Insert in batches (not upsert — wipe table of WNBA accolades first if re-running)
  console.log('Inserting to Supabase...');
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < allAccolades.length; i += BATCH) {
    const batch = allAccolades.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_accolades')
      .insert(batch);

    if (error) { console.error(`Batch error at ${i}: ${error.message}`); errors++; }
    else inserted += batch.length;
  }

  console.log(`Done! Inserted ${inserted} WNBA accolades (${errors} errors).`);
  console.log('NOTE: Uses INSERT — wipe WNBA accolades first if re-running to avoid dupes.');
}

main().catch(console.error);
