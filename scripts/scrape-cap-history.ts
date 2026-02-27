/**
 * Scrape NBA salary cap history from Basketball-Reference.
 *
 * Source: https://www.basketball-reference.com/contracts/salary-cap-history.html
 * Single-page scrape — no rate limiting needed.
 * Caches HTML in data/bbref-cache/salary-cap-history.html.
 *
 * Populates: salary_cap_history table
 *
 * Usage:
 *   npx tsx scripts/scrape-cap-history.ts              # Scrape and upsert
 *   npx tsx scripts/scrape-cap-history.ts --dry-run    # Parse only, print to console
 *   npx tsx scripts/scrape-cap-history.ts --refresh     # Re-fetch even if cached
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'salary-cap-history.html');
const URL = 'https://www.basketball-reference.com/contracts/salary-cap-history.html';

interface CapRow {
  season: string;          // e.g., '2023-24'
  salary_cap: number;
  luxury_tax: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseDollar(text: string): number | null {
  if (!text) return null;
  // Remove $, commas, whitespace. Handle "N/A" or empty.
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === 'N/A' || cleaned === '-' || cleaned === '—') return null;
  const num = parseInt(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Convert BBRef season string to our format.
 * BBRef might show "2023-24" directly, or "2023-2024", or just "2024" (end year).
 */
function normalizeSeason(raw: string): string | null {
  const trimmed = raw.trim();

  // Already in our format: "2023-24"
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;

  // Full format: "2023-2024"
  const fullMatch = trimmed.match(/^(\d{4})-(\d{4})$/);
  if (fullMatch) {
    return `${fullMatch[1]}-${fullMatch[2].slice(2)}`;
  }

  // End year only: "2024"
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const endYear = parseInt(yearMatch[1]);
    return `${endYear - 1}-${String(endYear).slice(2)}`;
  }

  return null;
}

// ── Fetch ────────────────────────────────────────────────────────────

async function fetchCapPage(refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(CACHE_FILE)) {
    console.log('Using cached HTML...');
    return fs.readFileSync(CACHE_FILE, 'utf-8');
  }

  console.log(`Fetching ${URL}...`);
  const resp = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} fetching cap history page`);
  }

  const html = await resp.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, html);
  console.log('Cached HTML to', CACHE_FILE);
  return html;
}

// ── Parser ───────────────────────────────────────────────────────────

/**
 * BBRef wraps many tables in HTML comments for lazy-loading.
 * Extract the commented-out table and parse it.
 */
function extractCommentedTable(html: string, tableId: string): string | null {
  // Look for <!-- ... <table id="tableId" ... --> pattern
  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(html)) !== null) {
    const comment = match[1];
    if (comment.includes(`id="${tableId}"`)) {
      return comment;
    }
  }
  return null;
}

function parseCapTable(html: string): CapRow[] {
  const rows: CapRow[] = [];

  // BBRef hides this table in an HTML comment — extract it first
  let tableHtml = extractCommentedTable(html, 'salary_cap_history');
  if (!tableHtml) {
    // Try parsing directly (in case BBRef changes their approach)
    tableHtml = html;
    console.log('Table not found in comments, trying direct parse...');
  } else {
    console.log('Found salary_cap_history table inside HTML comment.');
  }

  const $ = cheerio.load(tableHtml);
  const $table = $('table#salary_cap_history');

  if ($table.length === 0) {
    console.error('Could not find salary_cap_history table.');
    return rows;
  }

  // BBRef uses data-stat attributes on cells — much more reliable than column indices
  $table.find('tr').each((_, tr) => {
    const $tr = $(tr);

    // Season: in a <th> with data-stat="year_id"
    const seasonCell = $tr.find('[data-stat="year_id"]');
    const seasonRaw = seasonCell.text().trim();

    // Cap: in a <td> with data-stat="cap"
    const capCell = $tr.find('[data-stat="cap"]');
    const capRaw = capCell.text().trim();

    const season = normalizeSeason(seasonRaw);
    const salaryCap = parseDollar(capRaw);

    if (!season || !salaryCap) return;

    // Filter to 1984-85+ (salary cap was introduced in 1984-85)
    const startYear = parseInt(season.split('-')[0]);
    if (startYear < 1984) return;

    rows.push({
      season,
      salary_cap: salaryCap,
      luxury_tax: null, // BBRef cap history page doesn't include luxury tax
    });
  });

  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const refresh = args.includes('--refresh');

  const html = await fetchCapPage(refresh);
  const rows = parseCapTable(html);

  console.log(`\nParsed ${rows.length} cap history rows.`);

  if (rows.length === 0) {
    console.error('No rows parsed — check the HTML structure.');
    process.exit(1);
  }

  // Print sample
  console.log('\nSample rows:');
  for (const row of rows.slice(0, 5)) {
    console.log(`  ${row.season}: cap=$${(row.salary_cap / 1_000_000).toFixed(1)}M, tax=${row.luxury_tax ? `$${(row.luxury_tax / 1_000_000).toFixed(1)}M` : 'N/A'}`);
  }
  console.log('  ...');
  for (const row of rows.slice(-3)) {
    console.log(`  ${row.season}: cap=$${(row.salary_cap / 1_000_000).toFixed(1)}M, tax=${row.luxury_tax ? `$${(row.luxury_tax / 1_000_000).toFixed(1)}M` : 'N/A'}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: skipping DB write.');
    return;
  }

  // Upsert to salary_cap_history
  console.log('\nUpserting to salary_cap_history...');
  const BATCH = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('salary_cap_history')
      .upsert(batch, { onConflict: 'season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Done! Upserted ${inserted} cap history rows.`);
}

main().catch(console.error);
