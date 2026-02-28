/**
 * Scrape NBA trades from Basketball-Reference transaction pages.
 *
 * URL pattern: https://www.basketball-reference.com/friv/transactions.fcgi?month=M&day=D
 *
 * Rate limit: 20 req/min (1 request per 3 seconds)
 * Caches raw HTML in data/bbref-cache/ to avoid re-fetching.
 *
 * Usage:
 *   npx tsx scripts/scrape-bbref-trades.ts                    # Scrape Feb 8, 2019 to today
 *   npx tsx scripts/scrape-bbref-trades.ts --from 2023-01-01  # Custom start date
 *   npx tsx scripts/scrape-bbref-trades.ts --to 2024-06-30    # Custom end date
 *   npx tsx scripts/scrape-bbref-trades.ts --dry-run           # Parse only, don't write
 *   npx tsx scripts/scrape-bbref-trades.ts --overwrite         # Re-parse and replace existing BBRef trades
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveTeamId, resolveFullTeamName, dateToSeason } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');
const RATE_LIMIT_MS = 3100; // 3.1 seconds between requests

interface StaticTradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string | null;
  to_team_id: string | null;
  pick_year: number | null;
  pick_round: number | null;
  original_team_id: string | null;
  became_player_name: string | null;
  notes: string | null;
}

interface StaticTrade {
  id: string;
  date: string;
  season: string;
  title: string;
  description: string;
  is_multi_team: boolean;
  teams: { team_id: string; role: string }[];
  assets: StaticTradeAsset[];
}

interface SearchIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
  topAssets: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateTradeId(date: string, teamIds: string[]): string {
  const sorted = [...teamIds].sort().join('-');
  const hash = crypto.createHash('md5').update(`${date}|${sorted}`).digest('hex').slice(0, 8);
  return `bbref-${date}-${hash}`;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getCachePath(month: number, day: number): string {
  return path.join(CACHE_DIR, `${month}-${day}.html`);
}

async function fetchPage(month: number, day: number): Promise<string> {
  const cachePath = getCachePath(month, day);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `https://www.basketball-reference.com/friv/transactions.fcgi?month=${month}&day=${day}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      console.log('  Rate limited, waiting 60s...');
      await sleep(60000);
      return fetchPage(month, day);
    }
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const html = await resp.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
}

// ── Parser ───────────────────────────────────────────────────────────

function extractTeamFromLink(href: string): string | null {
  // /teams/ABC/ or /teams/ABC/2024.html
  const match = href.match(/\/teams\/([A-Z]{3})\//);
  if (match) return resolveTeamId(match[1]);
  return null;
}

function extractPlayerFromLink(href: string, text: string): { name: string; bbrefId: string } | null {
  // /players/x/lastname01.html
  const match = href.match(/\/players\/\w\/(\w+)\.html/);
  if (match) return { name: text.trim(), bbrefId: match[1] };
  return null;
}

interface ParsedAsset {
  text: string;
  fromTeam: string | null;
  toTeam: string | null;
  type: 'player' | 'pick' | 'swap' | 'cash';
  playerName: string | null;
  pickYear: number | null;
  pickRound: number | null;
  originalTeam: string | null;
  becamePlayer: string | null;
}

function parseTradeText($: cheerio.CheerioAPI, el: Parameters<typeof $>[0], year: number): StaticTrade[] {
  const $el = $(el);
  const text = $el.text().trim();

  // Only care about trades
  if (!text.toLowerCase().includes('traded')) return [];

  // Date is set by caller from the parent li's <strong> tag
  const dateMatch = text.match(/^(\w+ \d+, \d{4})/);

  // Get all links for team and player identification
  // BBRef links have data-attr-from (sending team) and data-attr-to (receiving team)
  const links: { href: string; text: string; attrFrom?: string; attrTo?: string }[] = [];
  $el.find('a').each((_, a) => {
    links.push({
      href: $(a).attr('href') || '',
      text: $(a).text(),
      attrFrom: $(a).attr('data-attr-from') || undefined,
      attrTo: $(a).attr('data-attr-to') || undefined,
    });
  });

  // Extract teams from links
  const teamsInTrade = new Set<string>();
  const teamLinks: { team: string; position: number }[] = [];
  for (const link of links) {
    const team = extractTeamFromLink(link.href);
    if (team) {
      teamsInTrade.add(team);
      teamLinks.push({ team, position: text.indexOf(link.text) });
    }
  }

  if (teamsInTrade.size < 2) return [];

  // Extract players from links
  const players: { name: string; bbrefId: string }[] = [];
  for (const link of links) {
    const player = extractPlayerFromLink(link.href, link.text);
    if (player) players.push(player);
  }

  // Parse the trade structure
  // BBRef format: "The Team A traded Player1 and a 2024 1st round draft pick to the Team B for Player2"
  // Multi-team: separated by semicolons or "In a 3-team trade..."
  const trades: StaticTrade[] = [];
  const assets: StaticTradeAsset[] = [];

  // Split on common multi-team delimiters
  const segments = text.split(/;\s*/);

  for (let segment of segments) {
    // Strip common prefixes that break team name resolution in multi-team trades
    // e.g., "In a 3-team trade, the Los Angeles Clippers traded..."
    // e.g., "and the Philadelphia 76ers traded..."
    segment = segment
      .replace(/^In a \d+-team trade,\s*/i, '')
      .replace(/^and\s+/i, '')
      // Strip trailing annotations after the trade text.
      // BBRef appends notes like ".  2027 1st-rd pick is a right to swap..."
      // or "Philadelphia also received trade exceptions" after a period + whitespace.
      // Player names like "P.J. Tucker" have periods followed by a letter, not spaces.
      .replace(/\.\s{2,}.*$/, '')
      .trim();

    const segLower = segment.toLowerCase();

    // Find "traded ... to" pattern
    const tradedToMatch = segment.match(
      /(?:The\s+)?(.+?)\s+traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+))?$/i
    );

    if (tradedToMatch) {
      const [, fromTeamText, assetsGiven, toTeamText, assetsReceived] = tradedToMatch;

      const fromTeam = resolveFullTeamName(fromTeamText.replace(/^the\s+/i, '').trim());
      const toTeam = resolveFullTeamName(toTeamText.replace(/^the\s+/i, '').trim());

      if (fromTeam && toTeam) {
        // Parse assets given (from -> to)
        parseAssetsFromText(assetsGiven, fromTeam, toTeam, assets, links, text);

        // Parse assets received (to -> from)
        if (assetsReceived) {
          parseAssetsFromText(assetsReceived, toTeam, fromTeam, assets, links, text);
        }
      }
    }
  }

  // If structured parsing failed, fall back to simpler extraction
  if (assets.length === 0 && players.length > 0) {
    const teamArr = [...teamsInTrade];
    for (const player of players) {
      // Try to determine direction from text position
      const playerPos = text.indexOf(player.name);
      let fromTeam: string | null = null;
      let toTeam: string | null = null;

      // Find nearest team mentions before and after player
      for (const tl of teamLinks) {
        if (tl.position < playerPos) fromTeam = tl.team;
        if (tl.position > playerPos && !toTeam) toTeam = tl.team;
      }

      // "traded X to Y" means X goes from the subject team to Y
      if (text.toLowerCase().includes(`traded ${player.name.toLowerCase()} to`)) {
        const tradedIdx = text.toLowerCase().indexOf(`traded ${player.name.toLowerCase()} to`);
        // The "to" team is after this phrase
        for (const tl of teamLinks) {
          if (tl.position > tradedIdx + player.name.length) {
            toTeam = tl.team;
            break;
          }
        }
        // The "from" team is before
        for (const tl of [...teamLinks].reverse()) {
          if (tl.position < tradedIdx) {
            fromTeam = tl.team;
            break;
          }
        }
      }

      assets.push({
        type: 'player',
        player_name: player.name,
        from_team_id: fromTeam || teamArr[0] || null,
        to_team_id: toTeam || teamArr[1] || null,
        pick_year: null,
        pick_round: null,
        original_team_id: null,
        became_player_name: null,
        notes: null,
      });
    }

    // Check for pick mentions
    const pickMatches = text.matchAll(
      /(\d{4})\s+(1st|2nd|first|second)\s+round\s+(?:draft\s+)?pick/gi
    );
    for (const m of pickMatches) {
      const pickYear = parseInt(m[1]);
      const pickRound = /1st|first/i.test(m[2]) ? 1 : 2;

      // Check for "was later selected" annotation
      const afterPick = text.slice(text.indexOf(m[0]) + m[0].length);
      const becameMatch = afterPick.match(
        /\((.+?)\s+was\s+later\s+selected\)/i
      );

      assets.push({
        type: 'pick',
        player_name: null,
        from_team_id: null,
        to_team_id: null,
        pick_year: pickYear,
        pick_round: pickRound,
        original_team_id: null,
        became_player_name: becameMatch ? becameMatch[1].trim() : null,
        notes: null,
      });
    }
  }

  if (assets.length === 0) return [];

  const teamArr = [...teamsInTrade];
  const dateStr = dateMatch
    ? new Date(dateMatch[1]).toISOString().split('T')[0]
    : `${year}-01-01`;

  // Build title from player names
  const playerNames = assets
    .filter((a) => a.type === 'player' && a.player_name)
    .map((a) => a.player_name!)
    .slice(0, 3);
  const title =
    playerNames.length > 0
      ? `${playerNames.join(', ')} Trade`
      : `${teamArr.join(' / ')} Trade`;

  const tradeId = generateTradeId(dateStr, teamArr);

  trades.push({
    id: tradeId,
    date: dateStr,
    season: dateToSeason(dateStr),
    title,
    description: text.replace(/\s+/g, ' ').trim(),
    is_multi_team: teamsInTrade.size > 2,
    teams: teamArr.map((t) => ({ team_id: t, role: 'participant' })),
    assets,
  });

  return trades;
}

function parseAssetsFromText(
  text: string,
  fromTeam: string,
  toTeam: string,
  assets: StaticTradeAsset[],
  links: { href: string; text: string }[],
  fullText: string
): void {
  // Split on "and" first, then split each part on commas to handle
  // mixed lists like "Player1, Player2, cash, a 2024 1st round draft pick and a 2025 2nd round draft pick"
  const rawParts = text.split(/\s+and\s+/i);
  const parts: string[] = [];
  for (const rp of rawParts) {
    // Further split on commas, but be careful not to split inside parenthetical annotations
    // like "(Juan Nunez was later selected)" or "(Atlanta's pick)"
    const subParts = rp.split(/,\s*/).filter((s) => s.trim().length > 0);
    parts.push(...subParts);
  }

  for (const part of parts) {
    const trimmed = part.trim();

    // Check if it's a draft pick
    const pickMatch = trimmed.match(
      /(?:a\s+)?(\d{4})\s+(1st|2nd|first|second)\s+round\s+(?:draft\s+)?pick/i
    );
    if (pickMatch) {
      const pickYear = parseInt(pickMatch[1]);
      const pickRound = /1st|first/i.test(pickMatch[2]) ? 1 : 2;

      // Look for "was later selected" annotation — check within trimmed first (it may be included),
      // then fall back to searching after trimmed in the full text
      const becameInTrimmed = trimmed.match(/\((.+?)\s+was\s+later\s+selected\)/i);
      const afterText = becameInTrimmed
        ? ''
        : fullText.slice(fullText.indexOf(trimmed) + trimmed.length);
      const becameMatch = becameInTrimmed ?? afterText.match(/\((.+?)\s+was\s+later\s+selected\)/i);

      // Look for original team
      const origMatch = trimmed.match(/\((.+?)'s\s+pick\)/i);
      const origTeam = origMatch ? resolveFullTeamName(origMatch[1]) : null;

      assets.push({
        type: 'pick',
        player_name: null,
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: pickYear,
        pick_round: pickRound,
        original_team_id: origTeam,
        became_player_name: becameMatch ? becameMatch[1].trim() : null,
        notes: null,
      });
      continue;
    }

    // Check for cash
    if (/cash/i.test(trimmed)) {
      assets.push({
        type: 'cash',
        player_name: null,
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: null,
        pick_round: null,
        original_team_id: null,
        became_player_name: null,
        notes: 'Cash considerations',
      });
      continue;
    }

    // Check for draft rights / swap
    if (/swap|right to swap/i.test(trimmed)) {
      const swapPickMatch = trimmed.match(/(\d{4})/);
      assets.push({
        type: 'swap',
        player_name: null,
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: swapPickMatch ? parseInt(swapPickMatch[1]) : null,
        pick_round: null,
        original_team_id: null,
        became_player_name: null,
        notes: trimmed,
      });
      continue;
    }

    // Otherwise it's a player — try to match against known player links
    const matchedPlayer = links.find((l) => {
      if (!l.href.includes('/players/')) return false;
      return trimmed.includes(l.text);
    });

    if (matchedPlayer) {
      assets.push({
        type: 'player',
        player_name: matchedPlayer.text.trim(),
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: null,
        pick_round: null,
        original_team_id: null,
        became_player_name: null,
        notes: null,
      });
    } else if (trimmed.length > 2 && !trimmed.startsWith('a ') && !/^the\s/i.test(trimmed)) {
      // Might be a player name not linked
      assets.push({
        type: 'player',
        player_name: trimmed.replace(/^the\s+/i, ''),
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: null,
        pick_round: null,
        original_team_id: null,
        became_player_name: null,
        notes: null,
      });
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.indexOf('--from');
  const toArg = args.indexOf('--to');
  const dryRun = args.includes('--dry-run');

  const overwrite = args.includes('--overwrite');
  const fromDate = fromArg >= 0 ? new Date(args[fromArg + 1]) : new Date('2019-02-08');
  const toDate = toArg >= 0 ? new Date(args[toArg + 1]) : new Date();

  console.log(`Scraping BBRef trades from ${formatDate(fromDate)} to ${formatDate(toDate)}`);
  if (dryRun) console.log('(dry run — no files will be written)');
  if (overwrite) console.log('(overwrite mode — existing BBRef trades will be replaced)');

  // Load existing index for dedup
  const indexPath = path.join(OUT_DIR, 'index.json');
  let existingIndex: SearchIndexEntry[] = [];
  if (fs.existsSync(indexPath)) {
    existingIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  }
  const existingDates = new Set(existingIndex.map((e) => e.date));

  // Collect unique month/day pairs in range
  const daysSeen = new Set<string>();
  const daysToFetch: { month: number; day: number; year: number }[] = [];

  const current = new Date(fromDate);
  while (current <= toDate) {
    const month = current.getMonth() + 1;
    const day = current.getDate();
    const key = `${month}-${day}`;

    if (!daysSeen.has(key)) {
      daysSeen.add(key);
      daysToFetch.push({ month, day, year: current.getFullYear() });
    }
    current.setDate(current.getDate() + 1);
  }

  console.log(`Fetching ${daysToFetch.length} unique day pages...`);

  // Load existing season files for merging
  const seasonTrades = new Map<string, StaticTrade[]>();
  fs.mkdirSync(SEASON_DIR, { recursive: true });

  const existingFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));
  for (const file of existingFiles) {
    const season = file.replace('.json', '');
    const trades = JSON.parse(fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'));
    seasonTrades.set(season, trades);
  }

  let totalNew = 0;
  let totalSkipped = 0;

  for (let i = 0; i < daysToFetch.length; i++) {
    const { month, day, year } = daysToFetch[i];
    const cached = fs.existsSync(getCachePath(month, day));

    if (!cached) {
      process.stdout.write(
        `  [${i + 1}/${daysToFetch.length}] Fetching ${month}/${day}...`
      );
    }

    try {
      const html = await fetchPage(month, day);

      if (!cached) {
        await sleep(RATE_LIMIT_MS);
      }

      const $ = cheerio.load(html);

      // BBRef structure: ul.page_index > li (one per date-year group)
      // Each li has: <p><strong>Date</strong></p> then <p class="transaction">...</p> entries
      $('ul.page_index > li').each((_, li) => {
        const dateText = $(li).find('p > strong').first().text().trim();
        if (!dateText) return;

        const parsedDate = new Date(dateText);
        if (isNaN(parsedDate.getTime())) return;

        const dateStr = formatDate(parsedDate);
        const txYear = parsedDate.getFullYear();

        // Filter by date range
        if (dateStr < formatDate(fromDate) || dateStr > formatDate(toDate)) return;

        $(li).find('p.transaction').each((_, p) => {
          const pText = $(p).text().trim();
          if (!pText.toLowerCase().includes('traded')) return;

          const trades = parseTradeText($, p, txYear);
          for (const trade of trades) {
            // Override date from the li header (more reliable)
            trade.date = dateStr;
            trade.season = dateToSeason(dateStr);
            trade.id = generateTradeId(dateStr, trade.teams.map(t => t.team_id));

            // Dedup: check if we already have a trade on this date with same teams
            const season = trade.season;
            if (!seasonTrades.has(season)) seasonTrades.set(season, []);
            const existing = seasonTrades.get(season)!;
            const teamKey = trade.teams.map((x) => x.team_id).sort().join(',');
            const dupeIdx = existing.findIndex(
              (t) =>
                t.date === trade.date &&
                t.teams.map((x) => x.team_id).sort().join(',') === teamKey
            );

            if (dupeIdx >= 0) {
              if (overwrite && existing[dupeIdx].id.startsWith('bbref-')) {
                // Replace existing BBRef trade with freshly parsed version
                existing[dupeIdx] = { ...trade, id: existing[dupeIdx].id };
                totalNew++;
              } else {
                totalSkipped++;
              }
              return;
            }

            existing.push(trade);
            totalNew++;
          }
        });
      });

      if (!cached) {
        process.stdout.write(` ${totalNew} new trades so far\n`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Error fetching ${month}/${day}: ${msg}`);
    }
  }

  console.log(`\nFound ${totalNew} new trades, ${totalSkipped} duplicates skipped`);

  if (dryRun) {
    console.log('Dry run — not writing files.');
    return;
  }

  // Write updated season files
  const newIndex: SearchIndexEntry[] = [];
  let totalWritten = 0;

  for (const [season, trades] of seasonTrades) {
    // Sort by date
    trades.sort((a, b) => a.date.localeCompare(b.date));

    const filePath = path.join(SEASON_DIR, `${season}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    totalWritten += trades.length;

    for (const t of trades) {
      const players = t.assets
        .flatMap((a) => [a.player_name, a.became_player_name])
        .filter((n): n is string => !!n)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      const topAssets = t.teams.map(({ team_id }) => {
        const asset = t.assets.find(
          (a) => a.type === 'player' && a.player_name && a.from_team_id === team_id,
        );
        return asset?.player_name || '';
      });

      newIndex.push({
        id: t.id,
        date: t.date,
        season: t.season,
        title: t.title,
        teams: t.teams.map((x) => x.team_id),
        players,
        topAssets,
      });
    }
  }

  // Write index
  fs.writeFileSync(indexPath, JSON.stringify(newIndex));
  const indexSizeKB = (Buffer.byteLength(JSON.stringify(newIndex)) / 1024).toFixed(1);

  console.log(`Wrote ${totalWritten} total trades across ${seasonTrades.size} seasons`);
  console.log(`Search index: ${newIndex.length} entries (${indexSizeKB} KB)`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
