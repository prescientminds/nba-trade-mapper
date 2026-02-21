/**
 * Scrape NBA playoff results from Basketball-Reference.
 *
 * Fetches the playoff summary page for each season and extracts every
 * series result, determining how far each team advanced:
 *   R1    = lost in First Round
 *   R2    = lost in Second Round / Conference Semifinals
 *   CONF  = lost in Conference Finals
 *   FINALS = lost in NBA Finals
 *   CHAMP = won the championship
 *
 * Updates team_seasons.playoff_result and team_seasons.championship.
 *
 * URL pattern: https://www.basketball-reference.com/playoffs/NBA_{year}.html
 * Rate limit: 3.1s between requests (same as trade scraper)
 * Cache: data/bbref-cache/playoffs/NBA_{year}.html
 *
 * Usage:
 *   npx tsx scripts/scrape-playoff-results.ts             # All seasons 1977–present
 *   npx tsx scripts/scrape-playoff-results.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-playoff-results.ts --dry-run   # Parse only, no DB writes
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveTeamId } from './lib/team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'bbref-cache', 'playoffs');
const RATE_LIMIT_MS = 3100;
const START_YEAR = 1977; // First season after ABA-NBA merger: 1976-77

type PlayoffResult = 'R1' | 'R2' | 'CONF' | 'FINALS' | 'CHAMP';

interface SeriesResult {
  round: PlayoffResult;
  winnerAbbr: string;  // BBRef abbreviation (e.g. 'BOS', 'BRK')
  loserAbbr: string;
  winnerName: string;
  loserName: string;
  record: string;      // e.g. '4-1'
}

interface TeamPlayoffResult {
  team_id: string;
  season: string;
  playoff_result: PlayoffResult;
  championship: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getCachePath(year: number): string {
  return path.join(CACHE_DIR, `NBA_${year}.html`);
}

function bbrefSeasonToOurs(endYear: number): string {
  const startYear = endYear - 1;
  const endShort = String(endYear).slice(2);
  return `${startYear}-${endShort}`;
}

/** Extract BBRef team abbreviation from a /teams/XXX/YEAR.html href */
function abbrFromHref(href: string): string | null {
  const m = href.match(/\/teams\/([A-Z]{2,3})\/\d{4}/);
  return m ? m[1] : null;
}

/**
 * Map a BBRef round name to our PlayoffResult code.
 * Returns the code for the LOSER of this round.
 */
function roundNameToCode(name: string): PlayoffResult | null {
  const n = name.toLowerCase();
  if (n.includes('final') && !n.includes('conference') && !n.includes('conf')) {
    // "NBA Finals" or just "Finals"
    return 'FINALS';
  }
  if (n.includes('conference final') || n.includes('conf final')) {
    return 'CONF';
  }
  if (
    n.includes('semifinal') ||
    n.includes('semi-final') ||
    n.includes('second round') ||
    n.includes('division final')   // older eras used "Division Finals"
  ) {
    return 'R2';
  }
  if (
    n.includes('first round') ||
    n.includes('quarterfinal') ||
    n.includes('quarter-final') ||
    n.includes('preliminary')
  ) {
    return 'R1';
  }
  return null;
}

// ── Fetch ────────────────────────────────────────────────────────────

async function fetchPage(url: string, cachePath: string): Promise<string | null> {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf-8');
  }

  console.log(`  Fetching ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (resp.status === 404) {
    console.log(`  No playoffs page (404)`);
    return null;
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }

  const html = await resp.text();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, html);
  await sleep(RATE_LIMIT_MS);
  return html;
}

// ── Parse ────────────────────────────────────────────────────────────

/**
 * Parse the BBRef playoff summary page.
 *
 * BBRef formats series as table rows:
 *   <strong>Round Name</strong>  |  TeamA over TeamB (W-L)  |  Series Stats link
 *
 * The winner is always listed first (before "over").
 */
function parseSeries(html: string): SeriesResult[] {
  const $ = cheerio.load(html);
  const results: SeriesResult[] = [];

  // Find all <tr> elements that contain a round name in <strong> AND an "over" result
  $('tr').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length < 2) return;

    // First td: round name (sometimes wrapped in <strong> or tooltip span)
    const roundTd = tds.eq(0);
    const roundText = roundTd.find('strong').first().text().trim() ||
                      roundTd.text().trim();
    if (!roundText) return;

    const roundCode = roundNameToCode(roundText);
    if (!roundCode) return;

    // Second td: "TeamA \nover\n TeamB (W-L)" format
    // BBRef uses newlines around "over" — normalize before testing
    const resultTd = tds.eq(1);
    const resultText = resultTd.text().replace(/\s+/g, ' ').trim();
    if (!resultText.includes(' over ')) return;

    // Extract team links to get BBRef abbreviations
    const teamLinks = resultTd.find('a[href*="/teams/"]');
    if (teamLinks.length < 2) return;

    const winnerHref = teamLinks.eq(0).attr('href') || '';
    const loserHref = teamLinks.eq(1).attr('href') || '';
    const winnerAbbr = abbrFromHref(winnerHref);
    const loserAbbr = abbrFromHref(loserHref);

    if (!winnerAbbr || !loserAbbr) return;

    const winnerName = teamLinks.eq(0).text().trim();
    const loserName = teamLinks.eq(1).text().trim();

    // Extract record e.g. "(4-1)"
    const recordMatch = resultText.match(/\((\d+-\d+)\)/);
    const record = recordMatch ? recordMatch[1] : '';

    results.push({ round: roundCode, winnerAbbr, loserAbbr, winnerName, loserName, record });
  });

  return results;
}

/**
 * Convert parsed series results to per-team playoff results.
 * A team's result = the round code of the LAST series they played,
 * where losers get that round code and the Finals winner gets 'CHAMP'.
 */
function seriesToTeamResults(series: SeriesResult[], season: string): TeamPlayoffResult[] {
  // Track each team's deepest round reached
  const teamResults = new Map<string, TeamPlayoffResult>();

  // Depth ordering: R1 < R2 < CONF < FINALS < CHAMP
  const depth: Record<PlayoffResult, number> = { R1: 1, R2: 2, CONF: 3, FINALS: 4, CHAMP: 5 };

  function setResult(abbr: string, result: PlayoffResult) {
    const teamId = resolveTeamId(abbr);
    if (!teamId) {
      console.warn(`    Could not resolve team: ${abbr}`);
      return;
    }
    const existing = teamResults.get(teamId);
    if (!existing || depth[result] > depth[existing.playoff_result]) {
      teamResults.set(teamId, {
        team_id: teamId,
        season,
        playoff_result: result,
        championship: result === 'CHAMP',
      });
    }
  }

  for (const s of series) {
    // Loser gets eliminated at this round
    setResult(s.loserAbbr, s.round);

    // Winner advances; if this is the Finals, they're the champion
    if (s.round === 'FINALS') {
      setResult(s.winnerAbbr, 'CHAMP');
    } else {
      // Winner is still in the tournament — their result will be set
      // when they lose a later series (or win the Finals).
      // Set a minimum result now in case they don't appear again (shouldn't happen).
      const existing = teamResults.get(resolveTeamId(s.winnerAbbr) || '');
      if (!existing) {
        const winnerId = resolveTeamId(s.winnerAbbr);
        if (winnerId) {
          // Placeholder — will be overwritten by their actual final result
          teamResults.set(winnerId, {
            team_id: winnerId,
            season,
            playoff_result: s.round,  // at minimum, they won this round
            championship: false,
          });
        }
      }
    }
  }

  return [...teamResults.values()];
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const yearArg = args.find(a => a.startsWith('--year'));
  const singleYear = yearArg ? parseInt(yearArg.split('=')[1] || args[args.indexOf(yearArg) + 1]) : null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const currentYear = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
  const years = singleYear
    ? [singleYear]
    : Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

  console.log(`Scraping playoff results for ${years.length} season(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  let totalTeamResults: TeamPlayoffResult[] = [];
  let parseFailures = 0;

  for (const year of years) {
    const season = bbrefSeasonToOurs(year);
    const url = `https://www.basketball-reference.com/playoffs/NBA_${year}.html`;
    const cachePath = getCachePath(year);

    console.log(`${season} (${year}):`);

    const html = await fetchPage(url, cachePath);
    if (!html) {
      console.log(`  Skipped (no page)\n`);
      continue;
    }

    const series = parseSeries(html);

    if (series.length === 0) {
      console.warn(`  WARNING: No series found — page may have changed structure`);
      parseFailures++;
      console.log();
      continue;
    }

    const teamResults = seriesToTeamResults(series, season);

    // Log summary
    const champion = teamResults.find(r => r.championship);
    console.log(`  Series parsed: ${series.length}`);
    console.log(`  Teams with results: ${teamResults.length}`);
    if (champion) {
      console.log(`  Champion: ${champion.team_id}`);
    }
    if (dryRun) {
      for (const tr of teamResults) {
        console.log(`    ${tr.team_id}: ${tr.playoff_result}${tr.championship ? ' 🏆' : ''}`);
      }
    }

    totalTeamResults.push(...teamResults);
    console.log();
  }

  console.log(`\nTotal team-season results: ${totalTeamResults.length}`);
  console.log(`Parse failures: ${parseFailures}`);

  if (dryRun) {
    console.log('\nDry run — no database writes.');
    return;
  }

  if (totalTeamResults.length === 0) {
    console.log('Nothing to upsert.');
    return;
  }

  // Upsert in batches
  console.log('\nUpserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < totalTeamResults.length; i += BATCH) {
    const batch = totalTeamResults.slice(i, i + BATCH);
    const { error } = await supabase
      .from('team_seasons')
      .upsert(batch, { onConflict: 'team_id,season' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`\nDone! Upserted ${upserted} team-season playoff results (${errors} batch errors).`);
  if (parseFailures > 0) {
    console.log(`\n⚠️  ${parseFailures} season(s) failed to parse — check cache files for debugging.`);
  }
}

main().catch(console.error);
