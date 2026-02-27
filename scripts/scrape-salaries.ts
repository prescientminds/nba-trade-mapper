/**
 * Scrape NBA player salary data from Basketball-Reference.
 *
 * Two modes:
 *   1. Current contracts — single page at /contracts/players.html (~500 players, multi-year)
 *   2. Historical salaries — individual player pages for traded players (full career history)
 *
 * Rate limit: 3.1s between requests (BBRef rate limit: 20 req/min)
 * Cache: data/bbref-cache/contracts/ and data/bbref-cache/players/
 *
 * Populates: player_contracts table
 *
 * Usage:
 *   npx tsx scripts/scrape-salaries.ts                    # Current contracts (one page)
 *   npx tsx scripts/scrape-salaries.ts --historical       # Historical salaries for traded players
 *   npx tsx scripts/scrape-salaries.ts --historical --limit 50   # Limit to first 50 players
 *   npx tsx scripts/scrape-salaries.ts --dry-run          # Parse only, no DB writes
 *   npx tsx scripts/scrape-salaries.ts --refresh          # Re-fetch even if cached
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache');
const CONTRACTS_CACHE = path.join(CACHE_DIR, 'contracts');
const PLAYER_CACHE = path.join(CACHE_DIR, 'players');
const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const RATE_LIMIT_MS = 3100;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

interface SalaryRow {
  player_name: string;
  team_id: string;
  season: string;
  salary: number;
  contract_type: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function parseDollar(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned === 'N/A') return null;
  const num = parseInt(cleaned);
  return isNaN(num) ? null : num;
}

function cleanPlayerName(name: string): string {
  return stripDiacritics(name.replace(/\*/g, '').trim());
}

async function fetchWithCache(url: string, cachePath: string, refresh: boolean): Promise<string | null> {
  if (!refresh && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (resp.status === 404) return null;

    if (resp.status === 429) {
      console.log('  Rate limited, waiting 60s...');
      await sleep(60000);
      return fetchWithCache(url, cachePath, refresh);
    }

    if (!resp.ok) {
      console.error(`  HTTP ${resp.status} for ${url}`);
      return null;
    }

    const html = await resp.text();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, html);
    return html;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Fetch error: ${msg}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MODE 1: Current Contracts
// ═══════════════════════════════════════════════════════════════════

async function scrapeCurrentContracts(refresh: boolean): Promise<SalaryRow[]> {
  const url = 'https://www.basketball-reference.com/contracts/players.html';
  const cachePath = path.join(CONTRACTS_CACHE, 'players.html');

  console.log('Scraping current contracts from BBRef...');
  const html = await fetchWithCache(url, cachePath, refresh);
  if (!html) {
    console.error('Failed to fetch contracts page.');
    return [];
  }

  const $ = cheerio.load(html);
  const rows: SalaryRow[] = [];

  // Get column season labels from thead
  const seasonLabels: string[] = [];
  $('table#player-contracts thead tr').last().find('th').each((_, th) => {
    const label = $(th).attr('aria-label') || '';
    // Salary year columns have labels like "2025-26"
    if (/^\d{4}-\d{2}$/.test(label)) {
      seasonLabels.push(label);
    }
  });

  console.log(`  Seasons in contract table: ${seasonLabels.join(', ')}`);

  $('table#player-contracts tbody tr').each((_, tr) => {
    const $tr = $(tr);

    // Skip separator rows
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

    // Player name
    const playerCell = $tr.find('[data-stat="player"]');
    const playerName = cleanPlayerName(playerCell.text().trim());
    if (!playerName) return;

    // Team
    const teamCell = $tr.find('[data-stat="team_id"]');
    const teamAbbr = teamCell.text().trim();
    const teamId = resolveTeamId(teamAbbr);
    if (!teamId) return;

    // Salary for each year (y1 through y6)
    for (let i = 0; i < seasonLabels.length && i < 6; i++) {
      const statKey = `y${i + 1}`;
      const salaryCell = $tr.find(`[data-stat="${statKey}"]`);
      const csk = salaryCell.attr('csk');
      const salary = csk ? parseInt(csk) : parseDollar(salaryCell.text().trim());

      if (salary && salary > 0) {
        // Detect contract type from cell class
        let contractType: string | null = null;
        const cellClass = salaryCell.attr('class') || '';
        if (cellClass.includes('salary-pl')) contractType = 'player_option';
        if (cellClass.includes('salary-et')) contractType = 'early_termination';
        if (cellClass.includes('salary-tm')) contractType = 'team_option';

        rows.push({
          player_name: playerName,
          team_id: teamId,
          season: seasonLabels[i],
          salary,
          contract_type: contractType,
        });
      }
    }

    // Also grab guaranteed remaining
    const gtdCell = $tr.find('[data-stat="remain_gtd"]');
    const gtdCsk = gtdCell.attr('csk');
    if (gtdCsk) {
      // Store as metadata — we could use this for enrichment later
    }
  });

  return rows;
}

// ═══════════════════════════════════════════════════════════════════
// MODE 2: Historical Salaries from Individual Player Pages
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract BBRef HTML comments (tables are often hidden in comments).
 */
function extractCommentedHtml(html: string, sectionId: string): string | null {
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(html)) !== null) {
    if (match[1].includes(`id="${sectionId}"`)) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if a string looks like a real player name (not a pick description or garbage data).
 */
function isValidPlayerName(name: string): boolean {
  if (!name) return false;
  // Must start with a letter
  if (!/^[A-Za-z]/.test(name)) return false;
  // Must have at least two words (first + last name)
  if (name.split(/\s+/).length < 2) return false;
  // Skip pick/trade description strings
  if (/\b(pick|rd-rd|round|draft|own|protection|swap|cash|consideration|rights)\b/i.test(name)) return false;
  // Skip if it's mostly numbers
  if (name.replace(/[^0-9]/g, '').length > name.length / 2) return false;
  return true;
}

/**
 * Strip diacritical marks from a string (e.g., "Jokić" → "Jokic").
 */
function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Get unique traded player names from our static trade JSON files.
 * Includes both direct player assets AND players that draft picks became.
 */
function getTradedPlayerNames(): string[] {
  const players = new Set<string>();

  if (!fs.existsSync(TRADES_DIR)) {
    console.error(`Trades directory not found: ${TRADES_DIR}`);
    return [];
  }

  const seasonFiles = fs.readdirSync(TRADES_DIR).filter(f => f.endsWith('.json'));

  for (const file of seasonFiles) {
    const filePath = path.join(TRADES_DIR, file);
    const trades = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const trade of trades) {
      for (const asset of trade.assets || []) {
        // Players directly traded
        if (asset.type === 'player' && asset.player_name && isValidPlayerName(asset.player_name)) {
          players.add(stripDiacritics(asset.player_name));
        }
        // Players that draft picks became (e.g., Curry, Tatum)
        if (asset.became_player_name && isValidPlayerName(asset.became_player_name)) {
          players.add(stripDiacritics(asset.became_player_name));
        }
      }
    }
  }

  return [...players].sort();
}

/**
 * Known BBRef player IDs that don't follow the standard pattern.
 * Maps "First Last" → "bbref_id" (without .html).
 */
const BBREF_ID_OVERRIDES: Record<string, string> = {
  // Players with non-standard IDs or common name collisions
  'Nene': 'nenexxx01',
  'Metta World Peace': 'artesro01',
  'Ron Artest': 'artesro01',
  'Anfernee Hardaway': 'hardaan01',
  'Penny Hardaway': 'hardaan01',
  'Predrag Stojakovic': 'stojape01',
  'Peja Stojakovic': 'stojape01',
  'Hidayet Turkoglu': 'turkohe01',
  'Hedo Turkoglu': 'turkohe01',
  'Amare Stoudemire': 'stoudam01',
  'Amar\'e Stoudemire': 'stoudam01',
  'Mo Williams': 'willima01',
  'Maurice Williams': 'willima01',
  'K.J. Martin': 'martike04',
  'Kenyon Martin Jr.': 'martike04',
  'Kenyon Martin Jr': 'martike04',
};

/**
 * Known alternate names for the same player.
 * Used to verify we found the right BBRef page when the page name differs
 * from the search name (e.g., "Ron Artest" page shows "Metta World Peace").
 */
const NAME_ALIASES: Record<string, string[]> = {
  'ron artest': ['metta world peace'],
  'metta world peace': ['ron artest'],
  'anfernee hardaway': ['penny hardaway'],
  'penny hardaway': ['anfernee hardaway'],
  'predrag stojakovic': ['peja stojakovic'],
  'peja stojakovic': ['predrag stojakovic'],
  'hidayet turkoglu': ['hedo turkoglu'],
  'hedo turkoglu': ['hidayet turkoglu'],
  'amare stoudemire': ["amar'e stoudemire"],
  'mo williams': ['maurice williams'],
  'maurice williams': ['mo williams'],
  'k.j. martin': ['kenyon martin jr.', 'kenyon martin jr', 'kj martin'],
  'kenyon martin jr.': ['k.j. martin', 'kj martin'],
  'kj martin': ['k.j. martin', 'kenyon martin jr.'],
};

/** Suffixes that are not part of the "last name" for BBRef ID purposes. */
const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

/** Strip name suffixes and return [firstName, lastName] */
function parseNameParts(name: string): { firstName: string; lastName: string } {
  const parts = stripDiacritics(name).split(' ').filter(Boolean);
  // Remove trailing suffixes
  while (parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  const firstName = parts[0] || '';
  const lastName = parts[parts.length - 1] || '';
  return { firstName, lastName };
}

/**
 * Generate a BBRef player ID guess from a player name.
 * Pattern: {last_up_to_5}{first2}{suffix} — NO padding.
 * Example: "LeBron James" → "jamesle01", "Lonzo Ball" → "balllo01"
 */
function guessPlayerId(name: string): string {
  // Check overrides first
  const normalized = stripDiacritics(name);
  if (BBREF_ID_OVERRIDES[name]) return BBREF_ID_OVERRIDES[name];
  if (BBREF_ID_OVERRIDES[normalized]) return BBREF_ID_OVERRIDES[normalized];

  const { firstName, lastName } = parseNameParts(name);
  if (!firstName || !lastName) return name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 7) + '01';

  const fn = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const ln = lastName.toLowerCase().replace(/[^a-z]/g, '');

  // BBRef uses up to 5 chars of last name (NO padding) + 2 chars of first name + suffix
  return `${ln.slice(0, 5)}${fn.slice(0, 2)}01`;
}

/**
 * Get the first letter for the BBRef player URL path.
 */
function playerUrlLetter(name: string): string {
  const { lastName } = parseNameParts(name);
  return lastName[0].toLowerCase();
}

/**
 * Parse salary table from a BBRef individual player page.
 */
function parsePlayerSalaries(html: string, playerName: string): SalaryRow[] {
  const rows: SalaryRow[] = [];

  // The salary table might be in an HTML comment
  let salaryHtml = extractCommentedHtml(html, 'all_salaries');
  if (!salaryHtml) {
    // Try directly in the page
    salaryHtml = html;
  }

  const $ = cheerio.load(salaryHtml);

  // Find the salary table
  $('table').find('tr').each((_, tr) => {
    const $tr = $(tr);

    const seasonCell = $tr.find('[data-stat="season"]');
    const teamCell = $tr.find('[data-stat="team_name"]');
    const salaryCell = $tr.find('[data-stat="salary"]');

    const season = seasonCell.text().trim();
    const salary = salaryCell.attr('csk')
      ? parseInt(salaryCell.attr('csk')!)
      : parseDollar(salaryCell.text().trim());

    if (!season || !salary || !/^\d{4}-\d{2}$/.test(season)) return;

    // Extract team from link href
    const teamLink = teamCell.find('a').attr('href') || '';
    const teamMatch = teamLink.match(/\/teams\/([A-Z]{3})\//);
    const teamId = teamMatch ? resolveTeamId(teamMatch[1]) : null;

    if (!teamId) return;

    rows.push({
      player_name: playerName,
      team_id: teamId,
      season,
      salary,
      contract_type: null,
    });
  });

  return rows;
}

/**
 * Scrape salary history for a single player from their BBRef page.
 * Tries the guessed ID first, then suffixes 02-05 if 404.
 */
async function scrapePlayerHistory(
  playerName: string,
  refresh: boolean,
): Promise<SalaryRow[]> {
  const letter = playerUrlLetter(playerName);
  const baseId = guessPlayerId(playerName);
  const basePath = baseId.slice(0, -2); // Remove suffix number

  // Try suffix 01 through 05
  for (let suffix = 1; suffix <= 5; suffix++) {
    const playerId = `${basePath}${String(suffix).padStart(2, '0')}`;
    const url = `https://www.basketball-reference.com/players/${letter}/${playerId}.html`;
    const cachePath = path.join(PLAYER_CACHE, letter, `${playerId}.html`);

    const html = await fetchWithCache(url, cachePath, refresh);
    if (!html) {
      if (suffix === 1) {
        // First guess failed — unlikely to find with other suffixes for common names
        // But still try 02 in case of name collisions (e.g., two players named "Marcus Morris")
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      break; // Higher suffixes less likely
    }

    // Verify this is the right player by checking the page name
    const $ = cheerio.load(html);
    const pagePlayerName = $('h1 span').first().text().trim();
    const norm = (s: string) => stripDiacritics(s).toLowerCase().replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
    const pageNorm = norm(pagePlayerName);
    const queryNorm = norm(playerName);

    // Check direct match, or known alias match (try both raw and normalized keys)
    const queryLower = stripDiacritics(playerName).toLowerCase();
    const aliases = NAME_ALIASES[queryLower] || NAME_ALIASES[queryNorm] || [];
    const isMatch = pageNorm === queryNorm
      || aliases.some(a => norm(a) === pageNorm);

    if (pagePlayerName && !isMatch) {
      // Wrong player (name collision) — try next suffix
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    const salaries = parsePlayerSalaries(html, playerName);
    return salaries;
  }

  return [];
}

async function scrapeHistoricalSalaries(refresh: boolean, limit: number): Promise<SalaryRow[]> {
  console.log('Collecting traded player names from static JSON...');
  const playerNames = getTradedPlayerNames();
  console.log(`  Found ${playerNames.length} unique traded players.`);

  const effectiveLimit = limit > 0 ? Math.min(limit, playerNames.length) : playerNames.length;
  console.log(`  Will scrape ${effectiveLimit} players.\n`);

  const allRows: SalaryRow[] = [];
  let scraped = 0;
  let withData = 0;
  let cached = 0;

  for (let i = 0; i < effectiveLimit; i++) {
    const name = playerNames[i];
    const letter = playerUrlLetter(name);
    const playerId = guessPlayerId(name);
    const cachePath = path.join(PLAYER_CACHE, letter, `${playerId}.html`);
    const wasCached = fs.existsSync(cachePath) && !refresh;

    const rows = await scrapePlayerHistory(name, refresh);

    if (rows.length > 0) {
      allRows.push(...rows);
      withData++;
      if (!wasCached) scraped++;
    }

    if (wasCached) {
      cached++;
    } else {
      scraped++;
      await sleep(RATE_LIMIT_MS);
    }

    // Progress report every 50 players
    if ((i + 1) % 50 === 0 || i + 1 === effectiveLimit) {
      console.log(
        `  Progress: ${i + 1}/${effectiveLimit} players | ` +
        `${allRows.length} salary records | ` +
        `${withData} with data | ${cached} cached`
      );
    }
  }

  return allRows;
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const refresh = args.includes('--refresh');
  const historical = args.includes('--historical');

  let limit = 0;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1]);
  }

  // --names "Player One,Player Two,..." — scrape specific players only
  const namesIdx = args.indexOf('--names');
  const specificNames = namesIdx >= 0 && args[namesIdx + 1]
    ? args[namesIdx + 1].split(',').map(n => n.trim())
    : null;

  let allRows: SalaryRow[];

  if (specificNames) {
    console.log(`=== Scraping ${specificNames.length} specific players ===\n`);
    allRows = [];
    for (const name of specificNames) {
      console.log(`  ${name}...`);
      const rows = await scrapePlayerHistory(name, refresh);
      if (rows.length > 0) {
        allRows.push(...rows);
        console.log(`    → ${rows.length} salary records`);
      } else {
        console.log(`    → No data found`);
      }
      await sleep(RATE_LIMIT_MS);
    }
  } else if (historical) {
    console.log('=== Historical Salary Scraper (BBRef Player Pages) ===\n');
    allRows = await scrapeHistoricalSalaries(refresh, limit);
  } else {
    console.log('=== Current Contracts Scraper (BBRef Contracts Page) ===\n');
    allRows = await scrapeCurrentContracts(refresh);
  }

  console.log(`\nTotal: ${allRows.length} salary records.`);

  if (allRows.length === 0) {
    console.log('No salary data parsed.');
    return;
  }

  // Print summary
  const bySeason = new Map<string, number>();
  for (const row of allRows) {
    bySeason.set(row.season, (bySeason.get(row.season) || 0) + 1);
  }
  console.log('\nPlayers per season:');
  for (const [season, count] of [...bySeason.entries()].sort()) {
    console.log(`  ${season}: ${count}`);
  }

  // Print top salaries
  const sorted = [...allRows].sort((a, b) => b.salary - a.salary);
  console.log('\nTop 10 salaries:');
  for (const row of sorted.slice(0, 10)) {
    console.log(`  ${row.player_name} (${row.team_id}, ${row.season}): $${(row.salary / 1_000_000).toFixed(1)}M`);
  }

  if (dryRun) {
    console.log('\n--dry-run: skipping DB write.');
    return;
  }

  // Deduplicate: keep last occurrence per (player_name, team_id, season)
  const deduped = new Map<string, SalaryRow>();
  for (const row of allRows) {
    const key = `${row.player_name}|${row.team_id}|${row.season}`;
    deduped.set(key, row);
  }
  const dedupedRows = [...deduped.values()];
  if (dedupedRows.length < allRows.length) {
    console.log(`  Deduped: ${allRows.length} → ${dedupedRows.length} (removed ${allRows.length - dedupedRows.length} duplicates)`);
  }

  // Upsert to player_contracts
  console.log('\nUpserting to player_contracts...');
  const BATCH = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < dedupedRows.length; i += BATCH) {
    const batch = dedupedRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('player_contracts')
      .upsert(batch, { onConflict: 'player_name,team_id,season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
    }

    if ((i + BATCH) % 5000 === 0 || i + BATCH >= dedupedRows.length) {
      console.log(`Progress: ${Math.min(i + BATCH, dedupedRows.length)}/${dedupedRows.length}`);
    }
  }

  console.log(`\nDone! Upserted ${inserted} salary records (${errors} batch errors).`);
}

main().catch(console.error);
