/**
 * Scrape NBA non-trade transactions from Basketball-Reference season pages.
 *
 * URL pattern: https://www.basketball-reference.com/leagues/NBA_{YYYY}_transactions.html
 * where YYYY is the end-year (2025 = 2024-25 season).
 *
 * Covers: signings, waivers, extensions, two-way, exhibit 10, 10-day,
 *         waiver claims, contract conversions, retirements, suspensions.
 *
 * Trades are SKIPPED (handled by scrape-bbref-trades.ts).
 *
 * Rate limit: 20 req/min (1 request per 3.1 seconds).
 * Caches raw HTML in data/bbref-cache/transactions/.
 *
 * Usage:
 *   npx tsx scripts/scrape-bbref-transactions.ts                     # Scrape 2000-present
 *   npx tsx scripts/scrape-bbref-transactions.ts --season 2025-26    # Single season
 *   npx tsx scripts/scrape-bbref-transactions.ts --from 2020         # From 2020 onward
 *   npx tsx scripts/scrape-bbref-transactions.ts --dry-run            # Parse only, no DB/file writes
 *   npx tsx scripts/scrape-bbref-transactions.ts --no-db              # Write JSON only, skip Supabase
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveTeamId, dateToSeason, bbrefSeasonToOurs } from './lib/team-resolver';
import { supabase } from './lib/supabase-admin';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache', 'transactions');
const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'transactions');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');
const RATE_LIMIT_MS = 3100;
const BATCH_SIZE = 500; // Supabase upsert batch size

// ── Types ────────────────────────────────────────────────────────────

interface PlayerTransaction {
  id: string;
  date: string | null;
  season: string;
  transaction_type: TransactionType;
  player_name: string;
  player_bbref_id: string | null;
  team_id: string | null;
  from_team_id: string | null;
  contract_type: string | null;
  description: string;
  notes: string | null;
  source_url: string;
}

type TransactionType =
  | 'signing'
  | 'waiver'
  | 'extension'
  | 'two_way'
  | 'exhibit_10'
  | '10_day'
  | 'claimed'
  | 'converted'
  | 'retirement'
  | 'suspension'
  | 'rest_of_season'
  | 'other';

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateId(date: string | null, playerName: string, type: string, teamId: string | null, description: string): string {
  const input = `${date || 'unknown'}|${playerName}|${type}|${teamId || 'none'}|${description}`;
  const hash = crypto.createHash('md5').update(input).digest('hex').slice(0, 8);
  return `tx-${date || 'unknown'}-${hash}`;
}

function getCachePath(endYear: number): string {
  return path.join(CACHE_DIR, `NBA_${endYear}_transactions.html`);
}

async function fetchSeasonPage(endYear: number): Promise<string> {
  const cachePath = getCachePath(endYear);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  const url = `https://www.basketball-reference.com/leagues/NBA_${endYear}_transactions.html`;
  console.log(`  Fetching ${url}...`);

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      console.log('  Rate limited, waiting 60s...');
      await sleep(60000);
      return fetchSeasonPage(endYear);
    }
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const html = await resp.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, html);
  return html;
}

/**
 * Parse a date string from BBRef (e.g., "June 26, 2024") into ISO format.
 */
function parseDate(text: string): string | null {
  if (!text || text === '?') return null;
  const d = new Date(text);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Extract BBRef player ID from an anchor href.
 * e.g., "/players/c/curryse01.html" -> "curryse01"
 */
function extractBbrefId(href: string | undefined): string | null {
  if (!href) return null;
  const match = href.match(/\/players\/\w\/(\w+)\.html/);
  return match ? match[1] : null;
}

/**
 * Extract team abbreviation from a team anchor's data-attr-from or data-attr-to,
 * or fall back to parsing the href.
 */
function extractTeamFromAnchor($el: cheerio.Cheerio<cheerio.Element>): string | null {
  // Try data attributes first
  const from = $el.attr('data-attr-from');
  const to = $el.attr('data-attr-to');
  const abbr = to || from;
  if (abbr) return resolveTeamId(abbr);

  // Fall back to href: /teams/BOS/2025.html
  const href = $el.attr('href');
  if (href) {
    const match = href.match(/\/teams\/(\w+)\//);
    if (match) return resolveTeamId(match[1]);
  }
  return null;
}

/**
 * Classify a transaction paragraph into a type.
 */
function classifyTransaction(text: string): { type: TransactionType; contractType: string | null } {
  const lower = text.toLowerCase();

  // Skip trades — handled by the trades scraper
  if (lower.includes(' traded ') && !lower.includes('claimed')) {
    return { type: 'other', contractType: null }; // will be filtered out
  }

  // Waivers
  if (lower.includes(' waived ')) {
    return { type: 'waiver', contractType: null };
  }

  // Claims off waivers
  if (lower.includes(' claimed ') && lower.includes(' on waivers')) {
    return { type: 'claimed', contractType: null };
  }

  // Contract conversions
  if (lower.includes(' converted ') && lower.includes(' from a two-way')) {
    return { type: 'converted', contractType: 'regular' };
  }

  // Extensions
  if (lower.includes(' contract extension')) {
    return { type: 'extension', contractType: 'extension' };
  }

  // Retirement
  if (lower.includes(' announced retirement') || lower.includes(' announced his retirement')) {
    return { type: 'retirement', contractType: null };
  }

  // Suspensions
  if (lower.includes(' was suspended ')) {
    return { type: 'suspension', contractType: null };
  }

  // Signings — order matters (most specific first)
  if (lower.includes(' exhibit 10 contract')) {
    return { type: 'exhibit_10', contractType: 'exhibit_10' };
  }
  if (lower.includes(' two-way contract')) {
    return { type: 'two_way', contractType: 'two_way' };
  }
  if (lower.includes(' 10-day contract')) {
    return { type: '10_day', contractType: '10_day' };
  }
  if (lower.includes(' rest-of-season contract') || lower.includes(' for the rest of the season')) {
    return { type: 'rest_of_season', contractType: 'rest_of_season' };
  }
  if (lower.includes(' multi-year contract')) {
    return { type: 'signing', contractType: 'multi_year' };
  }
  if (lower.includes(' signed ')) {
    return { type: 'signing', contractType: null };
  }

  return { type: 'other', contractType: null };
}

/**
 * Parse suspension notes (e.g., "(3-game suspension)").
 */
function extractSuspensionNotes(text: string): string | null {
  const match = text.match(/\((\d+-game suspension[^)]*)\)/);
  return match ? match[1] : null;
}

// ── Parser ───────────────────────────────────────────────────────────

function parseSeasonTransactions(
  html: string,
  endYear: number,
  sourceUrl: string
): PlayerTransaction[] {
  const $ = cheerio.load(html);
  const season = bbrefSeasonToOurs(endYear);
  const transactions: PlayerTransaction[] = [];

  $('ul.page_index > li').each((_, li) => {
    // Get date from the <span> element
    const dateSpan = $(li).children('span').first().text().trim();
    const date = parseDate(dateSpan);

    // Each <p> is a transaction
    $(li).children('p').each((_, p) => {
      const pEl = $(p);
      const text = pEl.text().trim();
      if (!text) return;

      const { type, contractType } = classifyTransaction(text);

      // Skip trades (handled by trades scraper) and unclassifiable entries
      if (type === 'other') return;

      // Extract player info from the first player anchor
      const playerAnchors = pEl.find('a[href*="/players/"]');
      if (playerAnchors.length === 0 && type !== 'other') {
        // Some entries (rare) may not have player links
        return;
      }

      const firstPlayer = playerAnchors.first();
      const playerName = firstPlayer.text().trim();
      const playerBbrefId = extractBbrefId(firstPlayer.attr('href'));

      // Extract team info from team anchors
      const teamAnchors = pEl.find('a[href*="/teams/"]');
      let teamId: string | null = null;
      let fromTeamId: string | null = null;

      if (type === 'claimed') {
        // "The {team_to} claimed {player} on waivers from the {team_from}."
        // First team anchor with data-attr-to is the claiming team
        // Team with data-attr-from is the waiving team
        teamAnchors.each((_, a) => {
          const aEl = $(a);
          if (aEl.attr('data-attr-to')) {
            teamId = extractTeamFromAnchor(aEl);
          } else if (aEl.attr('data-attr-from')) {
            fromTeamId = extractTeamFromAnchor(aEl);
          }
        });
      } else if (type === 'waiver') {
        // "The {team} waived {player}."
        teamAnchors.each((_, a) => {
          const aEl = $(a);
          const t = extractTeamFromAnchor(aEl);
          if (t && !teamId) teamId = t;
        });
      } else if (type === 'retirement' || type === 'suspension') {
        // May or may not have a team
        teamAnchors.each((_, a) => {
          const t = extractTeamFromAnchor($(a));
          if (t && !teamId) teamId = t;
        });
      } else {
        // Signings, extensions, conversions — team with data-attr-to is the signing team
        teamAnchors.each((_, a) => {
          const aEl = $(a);
          if (aEl.attr('data-attr-to')) {
            teamId = extractTeamFromAnchor(aEl);
          } else if (aEl.attr('data-attr-from') && !teamId) {
            teamId = extractTeamFromAnchor(aEl);
          }
        });
        // Fallback: first team anchor
        if (!teamId && teamAnchors.length > 0) {
          teamId = extractTeamFromAnchor($(teamAnchors[0]));
        }
      }

      const notes = type === 'suspension' ? extractSuspensionNotes(text) : null;

      const id = generateId(date, playerName, type, teamId, text);

      transactions.push({
        id,
        date,
        season,
        transaction_type: type,
        player_name: playerName,
        player_bbref_id: playerBbrefId,
        team_id: teamId,
        from_team_id: fromTeamId,
        contract_type: contractType,
        description: text,
        notes,
        source_url: sourceUrl,
      });
    });
  });

  return transactions;
}

// ── Supabase Upsert ──────────────────────────────────────────────────

async function upsertToSupabase(transactions: PlayerTransaction[]): Promise<number> {
  // Deduplicate by ID — BBRef pages sometimes have literal duplicate entries
  const seen = new Set<string>();
  const deduped = transactions.filter((tx) => {
    if (seen.has(tx.id)) return false;
    seen.add(tx.id);
    return true;
  });

  if (deduped.length < transactions.length) {
    console.log(`    (deduped: ${transactions.length} → ${deduped.length})`);
  }

  let upserted = 0;

  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('player_transactions')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  Supabase error at batch ${Math.floor(i / BATCH_SIZE)}:`, error.message);
    } else {
      upserted += batch.length;
    }
  }

  return upserted;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noDb = args.includes('--no-db');

  // Determine season range
  const seasonArg = args.indexOf('--season');
  const fromArg = args.indexOf('--from');

  let startYear: number;
  let endYearLimit: number;

  if (seasonArg >= 0) {
    // Single season: --season 2025-26 → endYear = 2026
    const s = args[seasonArg + 1];
    endYearLimit = parseInt(s.split('-')[0]) + 1;
    startYear = endYearLimit;
  } else if (fromArg >= 0) {
    // From year: --from 2020 → endYear starts at 2020
    startYear = parseInt(args[fromArg + 1]);
    endYearLimit = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
  } else {
    // Default: 2000 to current
    startYear = 2000;
    endYearLimit = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
  }

  console.log(`Scraping BBRef transactions for seasons ${bbrefSeasonToOurs(startYear)} through ${bbrefSeasonToOurs(endYearLimit)}`);
  if (dryRun) console.log('(dry run — no files or DB writes)');
  if (noDb) console.log('(no-db mode — JSON only, no Supabase)');

  fs.mkdirSync(SEASON_DIR, { recursive: true });

  let totalTransactions = 0;
  let totalSeasons = 0;
  const typeCounts: Record<string, number> = {};

  for (let endYear = startYear; endYear <= endYearLimit; endYear++) {
    const season = bbrefSeasonToOurs(endYear);
    const sourceUrl = `https://www.basketball-reference.com/leagues/NBA_${endYear}_transactions.html`;
    const cached = fs.existsSync(getCachePath(endYear));

    process.stdout.write(`  ${season}: `);

    try {
      const html = await fetchSeasonPage(endYear);

      if (!cached) {
        await sleep(RATE_LIMIT_MS);
      }

      const transactions = parseSeasonTransactions(html, endYear, sourceUrl);

      // Count by type
      for (const tx of transactions) {
        typeCounts[tx.transaction_type] = (typeCounts[tx.transaction_type] || 0) + 1;
      }

      console.log(`${transactions.length} transactions parsed`);

      if (!dryRun) {
        // Write static JSON
        const jsonPath = path.join(SEASON_DIR, `${season}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(transactions, null, 2));

        // Upsert to Supabase
        if (!noDb && transactions.length > 0) {
          const upserted = await upsertToSupabase(transactions);
          console.log(`    → ${upserted} upserted to Supabase`);
        }
      }

      totalTransactions += transactions.length;
      totalSeasons++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
    }
  }

  // Summary
  console.log(`\nDone: ${totalTransactions} transactions across ${totalSeasons} seasons`);
  console.log('By type:');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  // Write combined index
  if (!dryRun) {
    const allSeasons: Record<string, number> = {};
    const files = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8'));
      allSeasons[file.replace('.json', '')] = data.length;
    }
    fs.writeFileSync(
      path.join(OUT_DIR, 'index.json'),
      JSON.stringify(allSeasons, null, 2)
    );
    console.log(`\nIndex written: ${Object.keys(allSeasons).length} season files`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
