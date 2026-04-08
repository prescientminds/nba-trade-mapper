/**
 * Scrape Wikipedia NBA draft pages (1976-2025) via the MediaWiki API
 * to build a pick ownership lookup table.
 *
 * For every draft pick: who was the original team whose record determined
 * the slot, and who actually selected the player.
 *
 * Output: public/data/draft-ownership.json
 *
 * Usage:
 *   npx tsx scripts/scrape-wiki-draft-ownership.ts              # All years 1976-2025
 *   npx tsx scripts/scrape-wiki-draft-ownership.ts --year 2016   # Single year
 *   npx tsx scripts/scrape-wiki-draft-ownership.ts --from 2010   # 2010-present
 *   npx tsx scripts/scrape-wiki-draft-ownership.ts --no-cache    # Force re-fetch
 *   npx tsx scripts/scrape-wiki-draft-ownership.ts --dry-run     # Print without writing
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFullTeamName } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────

const CACHE_DIR = path.join(__dirname, '..', 'data', 'wiki-cache', 'draft');
const OUT_PATH = path.join(__dirname, '..', 'public', 'data', 'draft-ownership.json');
const RATE_LIMIT_MS = 1500;
const DEFAULT_START_YEAR = 1976;
const DEFAULT_END_YEAR = 2025;

// ── Types ────────────────────────────────────────────────────────────

interface DraftPick {
  year: number;
  round: number;
  overall_pick: number;
  player: string;
  selecting_team: string;
  original_team: string;
}

interface YearResult {
  year: number;
  picks: DraftPick[];
  errors: string[];
}

// ── Short name resolver ──────────────────────────────────────────────
// Wikipedia parentheticals often use short names like "(from Brooklyn)"
// or "(from New York)". resolveFullTeamName handles full names but not
// these abbreviated city/nickname forms.

const SHORT_NAME_TO_FULL: Record<string, string> = {
  // Current teams — city short forms
  'Atlanta': 'Atlanta Hawks',
  'Boston': 'Boston Celtics',
  'Brooklyn': 'Brooklyn Nets',
  'Charlotte': 'Charlotte Hornets',
  'Chicago': 'Chicago Bulls',
  'Cleveland': 'Cleveland Cavaliers',
  'Dallas': 'Dallas Mavericks',
  'Denver': 'Denver Nuggets',
  'Detroit': 'Detroit Pistons',
  'Golden State': 'Golden State Warriors',
  'Houston': 'Houston Rockets',
  'Indiana': 'Indiana Pacers',
  'L.A. Clippers': 'Los Angeles Clippers',
  'LA Clippers': 'Los Angeles Clippers',
  'L.A. Lakers': 'Los Angeles Lakers',
  'LA Lakers': 'Los Angeles Lakers',
  'Los Angeles': 'Los Angeles Lakers', // ambiguous, but Lakers are more common default
  'Memphis': 'Memphis Grizzlies',
  'Miami': 'Miami Heat',
  'Milwaukee': 'Milwaukee Bucks',
  'Minnesota': 'Minnesota Timberwolves',
  'New Orleans': 'New Orleans Pelicans',
  'New York': 'New York Knicks',
  'Oklahoma City': 'Oklahoma City Thunder',
  'Orlando': 'Orlando Magic',
  'Philadelphia': 'Philadelphia 76ers',
  'Phoenix': 'Phoenix Suns',
  'Portland': 'Portland Trail Blazers',
  'Sacramento': 'Sacramento Kings',
  'San Antonio': 'San Antonio Spurs',
  'Toronto': 'Toronto Raptors',
  'Utah': 'Utah Jazz',
  'Washington': 'Washington Wizards',

  // Historical short forms
  'New York Nets': 'New Jersey Nets', // ABA → NBA (1976), later Brooklyn Nets
  'New Jersey': 'New Jersey Nets',
  'Seattle': 'Seattle SuperSonics',
  'Vancouver': 'Vancouver Grizzlies',
  'Kansas City': 'Kansas City Kings',
  'San Diego': 'San Diego Clippers', // could also be Rockets pre-1971, but Clippers more likely in draft range
  'Buffalo': 'Buffalo Braves',
  'Baltimore': 'Baltimore Bullets',
  'Cincinnati': 'Cincinnati Royals',
  'Capital': 'Capital Bullets',

  // Nickname-only forms that sometimes appear
  'Nets': 'Brooklyn Nets',
  'Knicks': 'New York Knicks',
  'Lakers': 'Los Angeles Lakers',
  'Clippers': 'Los Angeles Clippers',
  'Celtics': 'Boston Celtics',
  'Heat': 'Miami Heat',
  'Bulls': 'Chicago Bulls',
  'Cavaliers': 'Cleveland Cavaliers',
  'Cavs': 'Cleveland Cavaliers',
  'Mavericks': 'Dallas Mavericks',
  'Mavs': 'Dallas Mavericks',
  'Nuggets': 'Denver Nuggets',
  'Pistons': 'Detroit Pistons',
  'Warriors': 'Golden State Warriors',
  'Rockets': 'Houston Rockets',
  'Pacers': 'Indiana Pacers',
  'Grizzlies': 'Memphis Grizzlies',
  'Bucks': 'Milwaukee Bucks',
  'Timberwolves': 'Minnesota Timberwolves',
  'Wolves': 'Minnesota Timberwolves',
  'Pelicans': 'New Orleans Pelicans',
  'Thunder': 'Oklahoma City Thunder',
  'Magic': 'Orlando Magic',
  '76ers': 'Philadelphia 76ers',
  'Sixers': 'Philadelphia 76ers',
  'Suns': 'Phoenix Suns',
  'Trail Blazers': 'Portland Trail Blazers',
  'Blazers': 'Portland Trail Blazers',
  'Kings': 'Sacramento Kings',
  'Spurs': 'San Antonio Spurs',
  'Raptors': 'Toronto Raptors',
  'Jazz': 'Utah Jazz',
  'Wizards': 'Washington Wizards',
  'SuperSonics': 'Seattle SuperSonics',
  'Sonics': 'Seattle SuperSonics',
  'Hornets': 'Charlotte Hornets',
  'Bobcats': 'Charlotte Bobcats',
  'Bullets': 'Washington Bullets',
  'Braves': 'Buffalo Braves',
};

/**
 * Resolve a team name (full, short city, or nickname) to our team_id.
 * Tries resolveFullTeamName first, then falls back to short name lookup.
 */
function resolveTeamName(name: string): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Try full name first
  const full = resolveFullTeamName(trimmed);
  if (full) return full;

  // Try short name lookup
  const fullName = SHORT_NAME_TO_FULL[trimmed];
  if (fullName) return resolveFullTeamName(fullName);

  // Try case-insensitive short name lookup
  const lower = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(SHORT_NAME_TO_FULL)) {
    if (key.toLowerCase() === lower) {
      return resolveFullTeamName(val);
    }
  }

  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getCachePath(year: number): string {
  return path.join(CACHE_DIR, `${year}.json`);
}

async function fetchDraftPage(year: number, noCache: boolean): Promise<string | null> {
  const cachePath = getCachePath(year);

  if (!noCache && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return cached.parse?.text?.['*'] ?? null;
  }

  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${year}_NBA_draft&prop=text&format=json`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'NBATradeMapper/1.0 (https://github.com/wandebao/nba-trade-mapper; polite bot)',
    },
  });

  if (!resp.ok) {
    console.warn(`  HTTP ${resp.status} for ${year}_NBA_draft`);
    return null;
  }

  const json = await resp.json();
  if (json.error) {
    console.warn(`  API error for ${year}: ${json.error.info}`);
    return null;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(json));

  return json.parse?.text?.['*'] ?? null;
}

// ── Team column parser ───────────────────────────────────────────────

/**
 * Clean raw cell text: strip footnote brackets, CSS artifacts, normalize whitespace.
 */
function cleanCellText(raw: string): string {
  return raw
    .replace(/\.mw-parser-output[\s\S]+$/, '')  // strip leaked CSS
    .replace(/\[[^\]]*\]/g, '')                  // strip [A], [a], [ii], etc.
    .replace(/[*†^~#§♠♣]+/g, '')                // strip footnote markers (*, **, etc.)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the first team name from a parenthetical fragment.
 * Strips trailing "via X", "to X", ", and X", and trailing parens/commas.
 */
function extractFirstTeamName(rawFragment: string): string {
  let cleaned = rawFragment
    .replace(/\s*,\s+and\s+.+$/i, '')
    .replace(/\s+via\s+.+$/i, '')
    .replace(/\s+to\s+.+$/i, '')
    .replace(/\s*,\s+.+$/i, '')
    .replace(/[()]+/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[,;:\s]+$/, '')
    .trim();
  return cleaned;
}

/**
 * Parse the team column of a draft table row.
 *
 * Wikipedia uses various HTML structures (<small>, <span style="font-size:85%">, or nothing)
 * for the parenthetical trade info. Instead of relying on HTML structure, we parse
 * the cleaned text directly. The patterns are:
 *
 *   "Philadelphia 76ers"                              → selecting=PHI, original=PHI
 *   "Boston Celtics (from Brooklyn Nets)"             → selecting=BOS, original=BKN
 *   "Boston Celtics (from Brooklyn via Boston)"       → selecting=BOS, original=BKN
 *   "Los Angeles Lakers (traded to Atlanta)"          → selecting=ATL, original=LAL
 *   "New Orleans (from Denver, traded to LA Clippers)"→ selecting=LAC, original=DEN
 *   "Portland (from X to Y to Z)"                    → selecting=POR, original=X
 */
function parseTeamCell($: cheerio.CheerioAPI, td: any): {
  selectingTeam: string | null;
  originalTeam: string | null;
  raw: string;
} {
  const $td = $(td);
  $td.find('style').remove();
  const raw = $td.text().trim();
  const clean = cleanCellText(raw);

  // Split into "Team Name" and parenthetical content
  // Match outermost parentheses — handle nested parens by finding the LAST ')'
  const firstParen = clean.indexOf('(');
  let mainTeamText: string;
  let paren: string;

  if (firstParen > 0) {
    mainTeamText = clean.substring(0, firstParen).replace(/[,;:\s]+$/, '').trim();
    // Find matching closing paren (handle possible nested parens, though rare)
    const lastParen = clean.lastIndexOf(')');
    paren = lastParen > firstParen
      ? clean.substring(firstParen + 1, lastParen).trim()
      : clean.substring(firstParen + 1).replace(/\)+$/, '').trim();
  } else {
    mainTeamText = clean.replace(/[,;:\s]+$/, '').trim();
    paren = '';
  }

  const listedTeam = resolveTeamName(mainTeamText);

  if (!paren) {
    // Handle edge case: "Dallas Mavericks, traded on draft day to the Cleveland Cavaliers"
    const commaTrade = mainTeamText.match(/^(.+?),\s*traded\s+.*?to\s+(?:the\s+)?(.+?)$/i);
    if (commaTrade) {
      const originalTeam = resolveTeamName(commaTrade[1].trim());
      const selectingTeam = resolveTeamName(commaTrade[2].trim());
      return { selectingTeam: selectingTeam || listedTeam, originalTeam: originalTeam || listedTeam, raw };
    }
    return { selectingTeam: listedTeam, originalTeam: listedTeam, raw };
  }

  // Normalize: "rights traded to" → "traded to"
  const norm = paren.replace(/rights\s+traded\s+to/gi, 'traded to');

  // ── Pattern 1: "from X ... traded to Y" ──
  // The "from" team is original, "traded to" team is actual selector
  const fromAndTraded = norm.match(/^from\s+(.+?)[\s,]+(?:(?:via|to)\s+.+?[\s,]+)?traded\s+to\s+(.+?)$/i);
  if (fromAndTraded) {
    const originalTeam = resolveTeamName(extractFirstTeamName(fromAndTraded[1]));
    const actualSelector = resolveTeamName(extractFirstTeamName(fromAndTraded[2]));
    return {
      selectingTeam: actualSelector || listedTeam,
      originalTeam: originalTeam || listedTeam,
      raw,
    };
  }

  // ── Pattern 2: "traded to X" (no "from") ──
  // Listed team is original, X is actual selector
  const tradedOnly = norm.match(/^traded\s+to\s+(.+?)$/i);
  if (tradedOnly) {
    const actualSelector = resolveTeamName(extractFirstTeamName(tradedOnly[1]));
    return {
      selectingTeam: actualSelector || listedTeam,
      originalTeam: listedTeam,
      raw,
    };
  }

  // ── Pattern 3: "from X" or "from X via Y" or "from X to Y to Z" ──
  // Listed team selected, X is original
  const fromOnly = norm.match(/^from\s+(.+?)$/i);
  if (fromOnly) {
    const originalTeam = resolveTeamName(extractFirstTeamName(fromOnly[1]));
    return {
      selectingTeam: listedTeam,
      originalTeam: originalTeam || listedTeam,
      raw,
    };
  }

  // Fallback — couldn't parse
  return { selectingTeam: listedTeam, originalTeam: listedTeam, raw };
}

// ── Draft table parser ───────────────────────────────────────────────

function parseDraftYear(html: string, year: number): YearResult {
  const $ = cheerio.load(html);
  const picks: DraftPick[] = [];
  const errors: string[] = [];

  // Find the draft table(s). Wikipedia uses "wikitable" class.
  // The main selection table usually has columns: Rnd, Pick, Player, Pos, Nationality, Team, School
  const tables = $('table.wikitable');

  let draftTable: cheerio.Cheerio<any> | null = null;

  tables.each((_, table) => {
    const $table = $(table);
    const headerText = $table.find('tr').first().text().toLowerCase();
    // The draft table has "rnd" or "round" and "pick" and ("player" or "pos") columns
    if (
      (headerText.includes('rnd') || headerText.includes('round')) &&
      headerText.includes('pick') &&
      (headerText.includes('player') || headerText.includes('pos'))
    ) {
      if (!draftTable) draftTable = $table;
    }
  });

  if (!draftTable) {
    // Fallback: try the first sortable wikitable
    tables.each((_, table) => {
      const $table = $(table);
      if ($table.hasClass('sortable') && !draftTable) {
        const headerText = $table.find('tr').first().text().toLowerCase();
        if (headerText.includes('pick') || headerText.includes('player')) {
          draftTable = $table;
        }
      }
    });
  }

  if (!draftTable) {
    errors.push(`No draft table found for ${year}`);
    return { year, picks, errors };
  }

  // Determine column indices from the header row
  const $headerRow = $(draftTable).find('tr').first();
  const headers: string[] = [];
  $headerRow.find('th, td').each((_, cell) => {
    headers.push($(cell).text().trim().toLowerCase());
  });

  let roundCol = headers.findIndex(h => h.includes('rnd') || h === 'round');
  let pickCol = headers.findIndex(h => h === 'pick' || h === '#');
  let playerCol = headers.findIndex(h => h.includes('player'));
  let teamCol = headers.findIndex(h => h.includes('team') && !h.includes('school') && !h.includes('club'));

  // If "team" header not found, try the 6th column (index 5) which is typical
  if (teamCol === -1) {
    // In standard Wikipedia draft tables: Rnd(0), Pick(1), Player(2), Pos(3), Nationality(4), Team(5), School(6)
    teamCol = 5;
  }
  if (roundCol === -1) roundCol = 0;
  if (pickCol === -1) pickCol = 1;
  if (playerCol === -1) playerCol = 2;

  // Parse each data row
  const rows = $(draftTable).find('tr').slice(1); // skip header

  rows.each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td, th');

    // Skip rows that are section headers (colspan rows, like forfeited picks or round dividers)
    if (cells.length < 5) return;

    // Check for colspan — these are forfeited pick rows or section headers
    const firstCell = cells.first();
    const colspan = parseInt(firstCell.attr('colspan') || '1');
    if (colspan > 2) return;

    // Extract round number
    const roundText = $(cells[roundCol]).text().trim();
    const round = parseInt(roundText);
    if (isNaN(round)) return;

    // Extract overall pick
    const pickText = $(cells[pickCol]).text().trim();
    const overallPick = parseInt(pickText);
    if (isNaN(overallPick)) return;

    // Extract player name — strip footnote markers (*, ^, ~, #, +, §) and superscripts
    const $playerCell = $(cells[playerCol]);
    $playerCell.find('sup').remove(); // remove superscripts (footnote refs)
    let playerName = $playerCell.text().trim();
    // Strip trailing markers
    playerName = playerName.replace(/[*^~#†+§♠♣]+$/, '').trim();
    if (!playerName) return;

    // Parse team column
    const teamCell = cells[teamCol];
    if (!teamCell) {
      errors.push(`${year} pick ${overallPick}: no team cell (only ${cells.length} cells)`);
      return;
    }

    const { selectingTeam, originalTeam, raw } = parseTeamCell($, teamCell as any);

    if (!selectingTeam) {
      errors.push(`${year} pick ${overallPick} (${playerName}): unresolved selecting team from "${raw}"`);
      return;
    }

    if (!originalTeam) {
      errors.push(`${year} pick ${overallPick} (${playerName}): unresolved original team from "${raw}"`);
      return;
    }

    picks.push({
      year,
      round,
      overall_pick: overallPick,
      player: playerName,
      selecting_team: selectingTeam,
      original_team: originalTeam,
    });
  });

  if (picks.length === 0) {
    errors.push(`No picks parsed for ${year}`);
  }

  return { year, picks, errors };
}

// ── CLI ──────────────────────────────────────────────────────────────

function parseArgs(): { years: number[]; noCache: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  const noCache = args.includes('--no-cache');
  const dryRun = args.includes('--dry-run');

  const yearIdx = args.indexOf('--year');
  const fromIdx = args.indexOf('--from');

  let startYear = DEFAULT_START_YEAR;
  let endYear = DEFAULT_END_YEAR;

  if (yearIdx >= 0 && args[yearIdx + 1]) {
    const y = parseInt(args[yearIdx + 1]);
    if (!isNaN(y)) {
      startYear = y;
      endYear = y;
    }
  } else if (fromIdx >= 0 && args[fromIdx + 1]) {
    const y = parseInt(args[fromIdx + 1]);
    if (!isNaN(y)) startYear = y;
  }

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  return { years, noCache, dryRun };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const { years, noCache, dryRun } = parseArgs();

  console.log(`Scraping Wikipedia draft pages: ${years[0]}–${years[years.length - 1]} (${years.length} years)`);
  if (noCache) console.log('(--no-cache: forcing fresh API requests)');
  if (dryRun) console.log('(--dry-run: will not write output file)');
  console.log();

  const allPicks: DraftPick[] = [];
  const allErrors: string[] = [];
  const failedYears: number[] = [];
  const unresolvedTeams = new Map<string, number>();
  let fetchCount = 0;

  for (const year of years) {
    const cachePath = getCachePath(year);
    const isCached = !noCache && fs.existsSync(cachePath);

    process.stdout.write(`  ${year}... `);

    const html = await fetchDraftPage(year, noCache);

    if (!html) {
      console.log('FAILED (no data)');
      failedYears.push(year);
      allErrors.push(`${year}: Failed to fetch page`);
      continue;
    }

    if (!isCached) {
      fetchCount++;
      if (fetchCount > 0 && years.indexOf(year) < years.length - 1) {
        // Rate limit only for non-cached requests
        await sleep(RATE_LIMIT_MS);
      }
    }

    const result = parseDraftYear(html, year);

    if (result.picks.length > 0) {
      console.log(`${result.picks.length} picks (${result.picks.filter(p => p.selecting_team !== p.original_team).length} traded)`);
    } else {
      console.log('NO PICKS PARSED');
      failedYears.push(year);
    }

    allPicks.push(...result.picks);

    for (const err of result.errors) {
      allErrors.push(err);
      // Track unresolved team names
      const unresolvedMatch = err.match(/unresolved .+ team from "(.+)"/);
      if (unresolvedMatch) {
        const key = unresolvedMatch[1];
        unresolvedTeams.set(key, (unresolvedTeams.get(key) || 0) + 1);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════════');
  console.log(`Total picks scraped: ${allPicks.length}`);
  const tradedPicks = allPicks.filter(p => p.selecting_team !== p.original_team);
  console.log(`Traded picks (original ≠ selecting): ${tradedPicks.length} (${(tradedPicks.length / allPicks.length * 100).toFixed(1)}%)`);
  console.log(`Years scraped: ${years.length}`);

  if (failedYears.length > 0) {
    console.log(`\nFailed years (${failedYears.length}): ${failedYears.join(', ')}`);
  }

  if (allErrors.length > 0) {
    console.log(`\nErrors (${allErrors.length}):`);
    for (const err of allErrors.slice(0, 30)) {
      console.log(`  - ${err}`);
    }
    if (allErrors.length > 30) {
      console.log(`  ... and ${allErrors.length - 30} more`);
    }
  }

  if (unresolvedTeams.size > 0) {
    console.log(`\nUnresolved team names (${unresolvedTeams.size}):`);
    const sorted = [...unresolvedTeams.entries()].sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      console.log(`  "${name}" × ${count}`);
    }
  }

  // ── Write output ─────────────────────────────────────────────────

  if (dryRun) {
    console.log('\n(dry run — no file written)');
    // Print a sample
    console.log('\nSample picks:');
    for (const p of allPicks.slice(0, 10)) {
      const traded = p.selecting_team !== p.original_team ? ` ← originally ${p.original_team}` : '';
      console.log(`  ${p.year} R${p.round} #${p.overall_pick}: ${p.player} → ${p.selecting_team}${traded}`);
    }
  } else {
    // Sort by year, then overall pick
    allPicks.sort((a, b) => a.year - b.year || a.overall_pick - b.overall_pick);

    const outDir = path.dirname(OUT_PATH);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(allPicks, null, 2));
    console.log(`\nWrote ${allPicks.length} picks to ${OUT_PATH}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
