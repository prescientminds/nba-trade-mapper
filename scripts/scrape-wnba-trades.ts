/**
 * Scrape WNBA trades from Basketball-Reference transaction pages.
 *
 * URL pattern: https://www.basketball-reference.com/wnba/years/{YEAR}_transactions.html
 *
 * Unlike the NBA day-by-day scraper, WNBA transactions are one page per season.
 * Only 29 pages total (1997–2025), so this runs quickly.
 *
 * Rate limit: 20 req/min (1 request per 3.1 seconds)
 * Caches raw HTML in data/wnba-bbref-cache/transactions/
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-trades.ts                    # Scrape all WNBA seasons
 *   npx tsx scripts/scrape-wnba-trades.ts --from 2020        # Start from 2020
 *   npx tsx scripts/scrape-wnba-trades.ts --to 2024          # End at 2024
 *   npx tsx scripts/scrape-wnba-trades.ts --dry-run           # Parse only, don't write
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveWnbaTeamId, resolveWnbaFullTeamName, dateToWnbaSeason } from './lib/wnba-team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'transactions');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'wnba', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');
const RATE_LIMIT_MS = 3100;
const FIRST_WNBA_SEASON = 1997;

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
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateTradeId(date: string, teamIds: string[]): string {
  const sorted = [...teamIds].sort().join('-');
  const hash = crypto.createHash('md5').update(`wnba|${date}|${sorted}`).digest('hex').slice(0, 8);
  return `wnba-${date}-${hash}`;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getCachePath(year: number): string {
  return path.join(CACHE_DIR, `${year}_transactions.html`);
}

async function fetchPage(year: number): Promise<string | null> {
  const cachePath = getCachePath(year);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `https://www.basketball-reference.com/wnba/years/${year}_transactions.html`;
  console.log(`  Fetching ${url}`);

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  if (resp.status === 404) {
    console.log(`  No transactions page for ${year} (404)`);
    return null;
  }

  if (resp.status === 429) {
    console.log('  Rate limited, waiting 60s...');
    await sleep(60000);
    return fetchPage(year);
  }

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const html = await resp.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  await sleep(RATE_LIMIT_MS);
  return html;
}

// ── Team extraction from BBRef links ─────────────────────────────────

function extractTeamFromLink(href: string): string | null {
  // WNBA BBRef pattern: /wnba/teams/ATL/ or /wnba/teams/ATL/2024.html
  const match = href.match(/\/wnba\/teams\/([A-Z]{2,3})\//);
  if (match) return resolveWnbaTeamId(match[1]);
  return null;
}

function extractPlayerFromLink(href: string, text: string): { name: string } | null {
  // WNBA BBRef pattern: /wnba/players/x/lastname01w.html
  const match = href.match(/\/wnba\/players\/\w\/(\w+)\.html/);
  if (match) return { name: text.trim() };
  return null;
}

// ── Trade parsing ────────────────────────────────────────────────────

function parseTradeFromTransaction(
  $: cheerio.CheerioAPI,
  el: Parameters<typeof $>[0],
  dateStr: string,
  season: string
): StaticTrade | null {
  const $el = $(el);
  const text = $el.text().trim();

  // Only care about trades
  if (!text.toLowerCase().includes('traded')) return null;

  // Get all links
  const links: { href: string; text: string }[] = [];
  $el.find('a').each((_, a) => {
    links.push({
      href: $(a).attr('href') || '',
      text: $(a).text().trim(),
    });
  });

  // Extract teams
  const teamsInTrade = new Set<string>();
  const teamLinks: { team: string; position: number }[] = [];
  for (const link of links) {
    const team = extractTeamFromLink(link.href);
    if (team) {
      teamsInTrade.add(team);
      teamLinks.push({ team, position: text.indexOf(link.text) });
    }
  }

  if (teamsInTrade.size < 2) return null;

  const assets: StaticTradeAsset[] = [];

  // Split on semicolons for multi-team trades
  const segments = text.split(/;\s*/);

  for (let segment of segments) {
    segment = segment
      .replace(/^In a \d+-team trade,\s*/i, '')
      .replace(/^and\s+/i, '')
      .replace(/\.\s{2,}.*$/, '')
      .trim();

    // "The Team A traded Player1 to the Team B for Player2"
    const tradedToMatch = segment.match(
      /(?:The\s+)?(.+?)\s+traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+for\s+(.+))?$/i
    );

    if (tradedToMatch) {
      const [, fromTeamText, assetsGiven, toTeamText, assetsReceived] = tradedToMatch;

      const fromTeam = resolveWnbaFullTeamName(fromTeamText.replace(/^the\s+/i, '').trim());
      const toTeam = resolveWnbaFullTeamName(toTeamText.replace(/^the\s+/i, '').trim());

      if (fromTeam && toTeam) {
        parseAssetsFromText(assetsGiven, fromTeam, toTeam, assets, links);
        if (assetsReceived) {
          parseAssetsFromText(assetsReceived, toTeam, fromTeam, assets, links);
        }
      }
    }
  }

  // Fallback: extract players from links if structured parsing failed
  if (assets.length === 0) {
    const players: { name: string }[] = [];
    for (const link of links) {
      const player = extractPlayerFromLink(link.href, link.text);
      if (player) players.push(player);
    }

    if (players.length === 0) return null;

    const teamArr = [...teamsInTrade];
    for (const player of players) {
      let fromTeam: string | null = null;
      let toTeam: string | null = null;
      const playerPos = text.indexOf(player.name);

      for (const tl of teamLinks) {
        if (tl.position < playerPos) fromTeam = tl.team;
        if (tl.position > playerPos && !toTeam) toTeam = tl.team;
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
      /(\d{4})\s+(1st|2nd|3rd|first|second|third)\s+round\s+(?:draft\s+)?pick/gi
    );
    for (const m of pickMatches) {
      const pickYear = parseInt(m[1]);
      const pickRound = /1st|first/i.test(m[2]) ? 1 : /2nd|second/i.test(m[2]) ? 2 : 3;

      assets.push({
        type: 'pick',
        player_name: null,
        from_team_id: null,
        to_team_id: null,
        pick_year: pickYear,
        pick_round: pickRound,
        original_team_id: null,
        became_player_name: null,
        notes: null,
      });
    }
  }

  if (assets.length === 0) return null;

  const teamArr = [...teamsInTrade];

  // Build title
  const playerNames = assets
    .filter((a) => a.type === 'player' && a.player_name)
    .map((a) => a.player_name!)
    .slice(0, 3);
  const title =
    playerNames.length > 0
      ? `${playerNames.join(', ')} Trade`
      : `${teamArr.map(t => t.replace('W-', '')).join(' / ')} Trade`;

  const tradeId = generateTradeId(dateStr, teamArr);

  return {
    id: tradeId,
    date: dateStr,
    season,
    title,
    description: text.replace(/\s+/g, ' ').trim(),
    is_multi_team: teamsInTrade.size > 2,
    teams: teamArr.map((t) => ({ team_id: t, role: 'participant' })),
    assets,
  };
}

function parseAssetsFromText(
  text: string,
  fromTeam: string,
  toTeam: string,
  assets: StaticTradeAsset[],
  links: { href: string; text: string }[]
): void {
  const rawParts = text.split(/\s+and\s+/i);
  const parts: string[] = [];
  for (const rp of rawParts) {
    const subParts = rp.split(/,\s*/).filter((s) => s.trim().length > 0);
    parts.push(...subParts);
  }

  for (const part of parts) {
    const trimmed = part.trim();

    // Draft pick
    const pickMatch = trimmed.match(
      /(?:a\s+)?(\d{4})\s+(1st|2nd|3rd|first|second|third)\s+round\s+(?:draft\s+)?pick/i
    );
    if (pickMatch) {
      const pickYear = parseInt(pickMatch[1]);
      const pickRound = /1st|first/i.test(pickMatch[2]) ? 1 : /2nd|second/i.test(pickMatch[2]) ? 2 : 3;

      const origMatch = trimmed.match(/\((.+?)'s\s+pick\)/i);
      const origTeam = origMatch ? resolveWnbaFullTeamName(origMatch[1]) : null;

      assets.push({
        type: 'pick',
        player_name: null,
        from_team_id: fromTeam,
        to_team_id: toTeam,
        pick_year: pickYear,
        pick_round: pickRound,
        original_team_id: origTeam,
        became_player_name: null,
        notes: null,
      });
      continue;
    }

    // Cash
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

    // Swap
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

    // Player — match against known links
    const matchedPlayer = links.find((l) => {
      if (!l.href.includes('/wnba/players/')) return false;
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

  const currentYear = new Date().getFullYear();
  const fromYear = fromArg >= 0 ? parseInt(args[fromArg + 1]) : FIRST_WNBA_SEASON;
  const toYear = toArg >= 0 ? parseInt(args[toArg + 1]) : currentYear;

  console.log(`Scraping WNBA trades from ${fromYear} to ${toYear}`);
  if (dryRun) console.log('(dry run — no files will be written)');

  fs.mkdirSync(SEASON_DIR, { recursive: true });

  // Load existing season files for merging
  const seasonTrades = new Map<string, StaticTrade[]>();
  const existingFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));
  for (const file of existingFiles) {
    const season = file.replace('.json', '');
    const trades = JSON.parse(fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'));
    seasonTrades.set(season, trades);
  }

  let totalNew = 0;
  let totalSkipped = 0;

  for (let year = fromYear; year <= toYear; year++) {
    const season = String(year);
    console.log(`\n${season}:`);

    const html = await fetchPage(year);
    if (!html) {
      console.log(`  Skipped (no page)`);
      continue;
    }

    const $ = cheerio.load(html);

    // BBRef WNBA transaction page structure:
    // <li> items with <span>Date</span> then <p> tags for each transaction.
    // No class="transaction" or "page_index" — just raw <li> + <p> pairs.
    $('li').each((_, li) => {
      const dateSpan = $(li).find('span').first();
      const dateText = dateSpan.text().trim();
      if (!dateText) return;

      const parsedDate = new Date(dateText);
      if (isNaN(parsedDate.getTime())) return;
      const dateStr = formatDate(parsedDate);

      $(li).find('p').each((_, p) => {
        const pText = $(p).text().trim();
        if (!pText.toLowerCase().includes('traded')) return;

        const trade = parseTradeFromTransaction($, p, dateStr, season);
        if (!trade) return;

        if (!seasonTrades.has(season)) seasonTrades.set(season, []);
        const existing = seasonTrades.get(season)!;

        // Dedup by date + teams
        const teamKey = trade.teams.map((x) => x.team_id).sort().join(',');
        const dupeIdx = existing.findIndex(
          (t) =>
            t.date === trade.date &&
            t.teams.map((x) => x.team_id).sort().join(',') === teamKey
        );

        if (dupeIdx >= 0) {
          totalSkipped++;
          return;
        }

        existing.push(trade);
        totalNew++;
      });
    });

    const seasonCount = seasonTrades.get(season)?.length || 0;
    console.log(`  Trades this season: ${seasonCount}`);
  }

  console.log(`\nFound ${totalNew} new trades, ${totalSkipped} duplicates skipped`);

  if (dryRun) {
    console.log('Dry run — not writing files.');
    // Show sample
    for (const [season, trades] of seasonTrades) {
      if (trades.length > 0) {
        console.log(`\n${season}: ${trades.length} trades`);
        for (const t of trades.slice(0, 3)) {
          console.log(`  ${t.date}: ${t.title} (${t.assets.length} assets)`);
        }
        if (trades.length > 3) console.log(`  ... and ${trades.length - 3} more`);
      }
    }
    return;
  }

  // Write season files
  const newIndex: SearchIndexEntry[] = [];
  let totalWritten = 0;

  for (const [season, trades] of seasonTrades) {
    trades.sort((a, b) => a.date.localeCompare(b.date));

    const filePath = path.join(SEASON_DIR, `${season}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    totalWritten += trades.length;

    for (const t of trades) {
      const players = t.assets
        .flatMap((a) => [a.player_name, a.became_player_name])
        .filter((n): n is string => !!n)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      newIndex.push({
        id: t.id,
        date: t.date,
        season: t.season,
        title: t.title,
        teams: t.teams.map((x) => x.team_id),
        players,
      });
    }
  }

  // Write index
  const indexPath = path.join(OUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(newIndex));

  console.log(`Wrote ${totalWritten} total trades across ${seasonTrades.size} seasons`);
  console.log(`Search index: ${newIndex.length} entries`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
