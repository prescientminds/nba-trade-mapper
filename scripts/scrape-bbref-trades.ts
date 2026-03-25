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
import { dateToSeason } from './lib/team-resolver';
import {
  parseTradeText,
  buildSearchIndexEntry,
  type StaticTrade,
  type SearchIndexEntry,
} from './lib/bbref-parser';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');
const RATE_LIMIT_MS = 3100; // 3.1 seconds between requests

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

      $('ul.page_index > li').each((_, li) => {
        const dateText = $(li).find('p > strong').first().text().trim();
        if (!dateText) return;

        const parsedDate = new Date(dateText);
        if (isNaN(parsedDate.getTime())) return;

        const dateStr = formatDate(parsedDate);
        const txYear = parsedDate.getFullYear();

        if (dateStr < formatDate(fromDate) || dateStr > formatDate(toDate)) return;

        $(li).find('p.transaction').each((_, p) => {
          const pText = $(p).text().trim();
          if (!pText.toLowerCase().includes('traded')) return;

          const trades = parseTradeText($, p, txYear);
          for (const trade of trades) {
            trade.date = dateStr;
            trade.season = dateToSeason(dateStr);
            trade.id = generateTradeId(dateStr, trade.teams.map(t => t.team_id));

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
    trades.sort((a, b) => a.date.localeCompare(b.date));

    const filePath = path.join(SEASON_DIR, `${season}.json`);
    fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    totalWritten += trades.length;

    for (const t of trades) {
      newIndex.push(buildSearchIndexEntry(t));
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
