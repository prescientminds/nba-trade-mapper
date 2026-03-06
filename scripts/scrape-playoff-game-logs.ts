/**
 * Scrape per-game playoff game logs from Basketball-Reference player pages.
 *
 * For each traded player, fetches their playoff game log page:
 *   /players/{letter}/{id}/gamelog-playoffs/
 *
 * One page per player contains ALL their career playoff games.
 * Parses the `player_game_log_post` table for per-game stats.
 *
 * PREREQUISITE: Run database/migrations/012-playoff-game-logs.sql first.
 *
 * Usage:
 *   npx tsx scripts/scrape-playoff-game-logs.ts                          # All traded players
 *   npx tsx scripts/scrape-playoff-game-logs.ts --limit 50               # First 50 players
 *   npx tsx scripts/scrape-playoff-game-logs.ts --names "LeBron James"   # Specific player(s)
 *   npx tsx scripts/scrape-playoff-game-logs.ts --dry-run                # Parse only, no DB writes
 *   npx tsx scripts/scrape-playoff-game-logs.ts --refresh                # Re-fetch even if cached
 *   npx tsx scripts/scrape-playoff-game-logs.ts --resume                 # Skip players already in DB
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache', 'playoff-game-logs');
const PLAYER_CACHE = path.join(__dirname, '..', 'data', 'bbref-cache', 'players');
const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const RATE_LIMIT_MS = 3100;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

interface GameLogRow {
  player_name: string;
  season: string;
  game_date: string;
  team_id: string;
  opponent_id: string;
  is_home: boolean;
  result: string | null;
  minutes: number | null;
  pts: number | null;
  trb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fg: number | null;
  fga: number | null;
  fg3: number | null;
  fg3a: number | null;
  ft: number | null;
  fta: number | null;
  orb: number | null;
  drb: number | null;
  pf: number | null;
  plus_minus: number | null;
  game_score: number | null;
  game_margin: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseNum(s: string): number | null {
  if (!s || s === '' || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseInt2(s: string): number | null {
  if (!s || s === '' || s === '-') return null;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

function parseMinutes(s: string): number | null {
  if (!s || s === '' || s === '-') return null;
  const parts = s.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]);
    const secs = parseInt(parts[1]);
    if (isNaN(mins)) return null;
    return mins + (isNaN(secs) ? 0 : secs / 60);
  }
  return parseNum(s);
}

/**
 * Derive our season format from a game date.
 * Playoff games happen April-June, so a game in 2006 is in the 2005-06 season.
 */
function dateToSeason(dateStr: string): string {
  const year = parseInt(dateStr.split('-')[0]);
  const month = parseInt(dateStr.split('-')[1]);
  // Playoffs are always in the second half of the season (Jan-Jun)
  // A game in April 2006 is in the 2005-06 season
  if (month >= 7) {
    // Shouldn't happen for playoffs, but handle gracefully
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

function parseResult(s: string): { result: string | null; margin: number | null } {
  if (!s) return { result: null, margin: null };
  const result = s.startsWith('W') ? 'W' : s.startsWith('L') ? 'L' : null;
  // Format: "W, 97-86" or "L, 84-89" or "W, 121-120 (OT)"
  const scoreMatch = s.match(/(\d+)-(\d+)/);
  let margin: number | null = null;
  if (scoreMatch) {
    margin = parseInt(scoreMatch[1]) - parseInt(scoreMatch[2]);
  }
  return { result, margin };
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

// ── Player ID resolution (same patterns as scrape-salaries.ts) ──────

const NAME_SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);

const BBREF_ID_OVERRIDES: Record<string, string> = {
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
  "Amar'e Stoudemire": 'stoudam01',
  'Mo Williams': 'willima01',
  'Maurice Williams': 'willima01',
  'K.J. Martin': 'martike04',
  'Kenyon Martin Jr.': 'martike04',
  'Kenyon Martin Jr': 'martike04',
};

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

function parseNameParts(name: string): { firstName: string; lastName: string } {
  const parts = stripDiacritics(name).split(' ').filter(Boolean);
  while (parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) {
    parts.pop();
  }
  return { firstName: parts[0] || '', lastName: parts[parts.length - 1] || '' };
}

function guessPlayerId(name: string): string {
  const normalized = stripDiacritics(name);
  if (BBREF_ID_OVERRIDES[name]) return BBREF_ID_OVERRIDES[name];
  if (BBREF_ID_OVERRIDES[normalized]) return BBREF_ID_OVERRIDES[normalized];

  const { firstName, lastName } = parseNameParts(name);
  if (!firstName || !lastName) return name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 7) + '01';

  const fn = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const ln = lastName.toLowerCase().replace(/[^a-z]/g, '');
  return `${ln.slice(0, 5)}${fn.slice(0, 2)}01`;
}

function playerUrlLetter(name: string): string {
  const { lastName } = parseNameParts(name);
  return lastName[0].toLowerCase();
}

// ── Player list ─────────────────────────────────────────────────────

function isValidPlayerName(name: string): boolean {
  if (!name) return false;
  if (!/^[A-Za-z]/.test(name)) return false;
  if (name.split(/\s+/).length < 2) return false;
  if (/\b(pick|rd-rd|round|draft|own|protection|swap|cash|consideration|rights)\b/i.test(name)) return false;
  if (name.replace(/[^0-9]/g, '').length > name.length / 2) return false;
  return true;
}

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
        if (asset.type === 'player' && asset.player_name && isValidPlayerName(asset.player_name)) {
          players.add(stripDiacritics(asset.player_name));
        }
        if (asset.became_player_name && isValidPlayerName(asset.became_player_name)) {
          players.add(stripDiacritics(asset.became_player_name));
        }
      }
    }
  }

  return [...players].sort();
}

// ── Parser ──────────────────────────────────────────────────────────

function parseGameLogs(html: string, playerName: string): GameLogRow[] {
  const $ = cheerio.load(html);
  const table = $('table#player_game_log_post');
  if (!table.length) return [];

  const rows: GameLogRow[] = [];

  table.find('tbody tr').each((_, tr) => {
    const $tr = $(tr);

    // Skip header separator rows
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

    // Skip inactive/DNP rows
    const reason = $tr.find('[data-stat="reason"]').text().trim();
    if (reason) return;

    const dateStr = $tr.find('[data-stat="date"]').find('a').text().trim()
      || $tr.find('[data-stat="date"]').text().trim();
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

    const teamAbbr = $tr.find('[data-stat="team_name_abbr"]').text().trim();
    const oppAbbr = $tr.find('[data-stat="opp_name_abbr"]').text().trim();
    const teamId = resolveTeamId(teamAbbr);
    const oppId = resolveTeamId(oppAbbr);
    if (!teamId || !oppId) return;

    const location = $tr.find('[data-stat="game_location"]').text().trim();
    const isHome = location !== '@';

    const resultStr = $tr.find('[data-stat="game_result"]').text().trim();
    const { result, margin } = parseResult(resultStr);

    rows.push({
      player_name: playerName,
      season: dateToSeason(dateStr),
      game_date: dateStr,
      team_id: teamId,
      opponent_id: oppId,
      is_home: isHome,
      result,
      minutes: parseMinutes($tr.find('[data-stat="mp"]').text().trim()),
      pts: parseInt2($tr.find('[data-stat="pts"]').text().trim()),
      trb: parseInt2($tr.find('[data-stat="trb"]').text().trim()),
      ast: parseInt2($tr.find('[data-stat="ast"]').text().trim()),
      stl: parseInt2($tr.find('[data-stat="stl"]').text().trim()),
      blk: parseInt2($tr.find('[data-stat="blk"]').text().trim()),
      tov: parseInt2($tr.find('[data-stat="tov"]').text().trim()),
      fg: parseInt2($tr.find('[data-stat="fg"]').text().trim()),
      fga: parseInt2($tr.find('[data-stat="fga"]').text().trim()),
      fg3: parseInt2($tr.find('[data-stat="fg3"]').text().trim()),
      fg3a: parseInt2($tr.find('[data-stat="fg3a"]').text().trim()),
      ft: parseInt2($tr.find('[data-stat="ft"]').text().trim()),
      fta: parseInt2($tr.find('[data-stat="fta"]').text().trim()),
      orb: parseInt2($tr.find('[data-stat="orb"]').text().trim()),
      drb: parseInt2($tr.find('[data-stat="drb"]').text().trim()),
      pf: parseInt2($tr.find('[data-stat="pf"]').text().trim()),
      plus_minus: parseNum($tr.find('[data-stat="plus_minus"]').text().trim()),
      game_score: parseNum($tr.find('[data-stat="game_score"]').text().trim()),
      game_margin: margin,
    });
  });

  return rows;
}

// ── Scrape single player ────────────────────────────────────────────

async function scrapePlayer(
  playerName: string,
  refresh: boolean,
): Promise<GameLogRow[]> {
  const letter = playerUrlLetter(playerName);
  const baseId = guessPlayerId(playerName);
  const basePath = baseId.slice(0, -2);

  for (let suffix = 1; suffix <= 5; suffix++) {
    const playerId = `${basePath}${String(suffix).padStart(2, '0')}`;
    const url = `https://www.basketball-reference.com/players/${letter}/${playerId}/gamelog-playoffs/`;
    const cachePath = path.join(CACHE_DIR, letter, `${playerId}.html`);

    const html = await fetchWithCache(url, cachePath, refresh);
    if (!html) {
      if (suffix === 1) {
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      break;
    }

    // Verify this is the right player by checking the page name
    const $ = cheerio.load(html);
    // Game log pages have h1 like "LeBron James Playoffs Game Log" — strip suffix
    const rawPageName = $('h1 span').first().text().trim();
    const pagePlayerName = rawPageName.replace(/\s+Playoffs?\s+Game\s+Log$/i, '');
    const norm = (s: string) => stripDiacritics(s).toLowerCase().replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
    const pageNorm = norm(pagePlayerName);
    const queryNorm = norm(playerName);

    const queryLower = stripDiacritics(playerName).toLowerCase();
    const aliases = NAME_ALIASES[queryLower] || NAME_ALIASES[queryNorm] || [];
    const isMatch = pageNorm === queryNorm
      || aliases.some(a => norm(a) === pageNorm);

    if (pagePlayerName && !isMatch) {
      await sleep(RATE_LIMIT_MS);
      continue;
    }

    return parseGameLogs(html, playerName);
  }

  return [];
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const refresh = args.includes('--refresh');
  const resume = args.includes('--resume');

  let limit = 0;
  const limitIdx = args.indexOf('--limit');
  if (limitIdx >= 0 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1]);
  }

  const namesIdx = args.indexOf('--names');
  const specificNames = namesIdx >= 0 && args[namesIdx + 1]
    ? args[namesIdx + 1].split(',').map(n => n.trim())
    : null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Pre-flight: verify table exists
  if (!dryRun) {
    const { error } = await supabase
      .from('playoff_game_logs')
      .select('id')
      .limit(1);

    if (error) {
      console.error('ERROR: playoff_game_logs table does not exist.');
      console.error('Run this SQL in the Supabase dashboard first:');
      console.error('  https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new\n');
      console.error(fs.readFileSync(
        path.join(__dirname, '..', 'database', 'migrations', '012-playoff-game-logs.sql'),
        'utf-8'
      ));
      process.exit(1);
    }
  }

  // Build player list
  let playerNames: string[];
  if (specificNames) {
    playerNames = specificNames;
    console.log(`=== Scraping ${playerNames.length} specific player(s) ===\n`);
  } else {
    console.log('Collecting traded player names from static JSON...');
    playerNames = getTradedPlayerNames();
    console.log(`  Found ${playerNames.length} unique traded players.`);
  }

  // If --resume, filter out players already in DB
  let alreadyScraped = new Set<string>();
  if (resume && !dryRun) {
    console.log('Checking which players are already in DB...');
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from('playoff_game_logs')
        .select('player_name')
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const row of data) {
        alreadyScraped.add(row.player_name);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    const before = playerNames.length;
    playerNames = playerNames.filter(n => !alreadyScraped.has(n));
    console.log(`  ${alreadyScraped.size} players already in DB, ${before - playerNames.length} skipped, ${playerNames.length} remaining.`);
  }

  const effectiveLimit = limit > 0 ? Math.min(limit, playerNames.length) : playerNames.length;
  console.log(`Will scrape ${effectiveLimit} players.${dryRun ? ' [DRY RUN]' : ''}\n`);

  const allRows: GameLogRow[] = [];
  let withData = 0;
  let noData = 0;
  let cached = 0;
  let fetched = 0;
  const startTime = Date.now();

  for (let i = 0; i < effectiveLimit; i++) {
    const name = playerNames[i];
    const letter = playerUrlLetter(name);
    const playerId = guessPlayerId(name);
    const cachePath = path.join(CACHE_DIR, letter, `${playerId}.html`);
    const wasCached = fs.existsSync(cachePath) && !refresh;

    const rows = await scrapePlayer(name, refresh);

    if (rows.length > 0) {
      allRows.push(...rows);
      withData++;
    } else {
      noData++;
    }

    if (wasCached) {
      cached++;
    } else {
      fetched++;
      await sleep(RATE_LIMIT_MS);
    }

    // Progress every 50 players
    if ((i + 1) % 50 === 0 || i + 1 === effectiveLimit) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = fetched > 0 ? (fetched / ((Date.now() - startTime) / 1000)).toFixed(1) : '0';
      const remaining = effectiveLimit - (i + 1);
      const eta = fetched > 0 ? ((remaining * (Date.now() - startTime) / (i + 1)) / 60000).toFixed(1) : '?';
      console.log(
        `  [${i + 1}/${effectiveLimit}] ${allRows.length} games | ` +
        `${withData} with data, ${noData} no data | ` +
        `${cached} cached, ${fetched} fetched | ` +
        `${elapsed}s elapsed, ~${eta}min remaining`
      );
    }
  }

  console.log(`\nTotal: ${allRows.length} playoff game log entries from ${withData} players.`);

  if (allRows.length === 0) {
    console.log('No game log data parsed.');
    return;
  }

  // Summary stats
  const bySeason = new Map<string, number>();
  for (const row of allRows) {
    bySeason.set(row.season, (bySeason.get(row.season) || 0) + 1);
  }
  console.log('\nGames per season (sample):');
  const sortedSeasons = [...bySeason.entries()].sort();
  for (const [season, count] of sortedSeasons.slice(-10)) {
    console.log(`  ${season}: ${count}`);
  }
  if (sortedSeasons.length > 10) {
    console.log(`  ... and ${sortedSeasons.length - 10} more seasons`);
  }

  // Top performers
  const topScorers = [...allRows]
    .filter(r => r.pts !== null)
    .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
  console.log('\nTop 5 single-game scoring:');
  for (const r of topScorers.slice(0, 5)) {
    console.log(`  ${r.player_name} (${r.team_id} vs ${r.opponent_id}, ${r.game_date}): ${r.pts} pts`);
  }

  if (dryRun) {
    console.log('\n--dry-run: skipping DB write.');
    return;
  }

  // Upsert in batches
  console.log('\nUpserting to playoff_game_logs...');
  const BATCH = 500;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allRows.length; i += BATCH) {
    const batch = allRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('playoff_game_logs')
      .upsert(batch, { onConflict: 'player_name,game_date,team_id' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }

    if ((i + BATCH) % 5000 === 0 || i + BATCH >= allRows.length) {
      console.log(`  Progress: ${Math.min(i + BATCH, allRows.length)}/${allRows.length}`);
    }
  }

  console.log(`\nDone! Upserted ${upserted} playoff game log rows (${errors} batch errors).`);
}

main().catch(console.error);
