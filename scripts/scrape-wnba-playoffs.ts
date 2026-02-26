/**
 * Scrape WNBA playoff results from Basketball-Reference.
 *
 * URL pattern: https://www.basketball-reference.com/wnba/playoffs/{YEAR}.html
 *
 * Determines how far each team advanced:
 *   R1    = lost in First Round
 *   R2    = lost in Second Round / Semifinals
 *   CONF  = lost in Conference Finals (if applicable)
 *   FINALS = lost in WNBA Finals
 *   CHAMP = won the championship
 *
 * Updates team_seasons.playoff_result and team_seasons.championship.
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-playoffs.ts             # All seasons
 *   npx tsx scripts/scrape-wnba-playoffs.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-wnba-playoffs.ts --dry-run   # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';
import { resolveWnbaTeamId } from './lib/wnba-team-resolver';

// ── Config ───────────────────────────────────────────────────────────
const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'playoffs');
const RATE_LIMIT_MS = 3100;
const FIRST_YEAR = 1997;

type PlayoffResult = 'R1' | 'R2' | 'CONF' | 'FINALS' | 'CHAMP';

interface TeamPlayoffResult {
  team_id: string;
  season: string;
  league: string;
  playoff_result: PlayoffResult;
  championship: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getCachePath(year: number): string {
  return path.join(CACHE_DIR, `${year}.html`);
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

function abbrFromHref(href: string): string | null {
  const m = href.match(/\/wnba\/teams\/([A-Z]{2,3})\//);
  return m ? m[1] : null;
}

/**
 * Map BBRef round name to our result code (for the LOSER of the round).
 * WNBA playoff format has changed many times — handle all variations.
 */
function roundNameToCode(name: string): PlayoffResult | null {
  const n = name.toLowerCase();
  if (n.includes('finals') && !n.includes('conference') && !n.includes('conf') && !n.includes('semi')) {
    return 'FINALS';
  }
  if (n.includes('conference final') || n.includes('conf final')) return 'CONF';
  if (n.includes('semifinal') || n.includes('semi-final') || n.includes('second round')) return 'R2';
  if (n.includes('first round') || n.includes('quarterfinal') || n.includes('elimination') || n.includes('preliminary')) return 'R1';
  return null;
}

function parseSeries(html: string): { round: PlayoffResult; winnerAbbr: string; loserAbbr: string }[] {
  // BBRef hides the playoff series table inside HTML comments.
  // Extract commented-out table HTML first, then parse it.
  const commentRegex = /<!--\s*(<div[^>]*id="div_all_playoffs"[\s\S]*?<\/div>)\s*-->/;
  const match = html.match(commentRegex);
  const tableHtml = match ? match[1] : html;

  const $ = cheerio.load(tableHtml);
  const results: { round: PlayoffResult; winnerAbbr: string; loserAbbr: string }[] = [];

  // WNBA BBRef uses: <tr> with <td><span><strong>Round</strong></span></td> <td>Winner over Loser (3-2)</td>
  // Skip class="toggleable" rows (game-by-game details) and class="thead" separator rows
  $('tr').not('.toggleable').not('.thead').each((_, row) => {
    const tds = $(row).find('td');
    if (tds.length < 2) return;

    // Round name is inside span > strong in the first td
    const roundText = tds.eq(0).find('strong').first().text().trim() || tds.eq(0).text().trim();
    if (!roundText) return;

    const roundCode = roundNameToCode(roundText);
    if (!roundCode) return;

    // Winner and loser are separate <a> tags in the second td
    const resultTd = tds.eq(1);
    const teamLinks = resultTd.find('a[href*="/wnba/teams/"]');
    if (teamLinks.length < 2) return;

    const winnerAbbr = abbrFromHref(teamLinks.eq(0).attr('href') || '');
    const loserAbbr = abbrFromHref(teamLinks.eq(1).attr('href') || '');
    if (!winnerAbbr || !loserAbbr) return;

    results.push({ round: roundCode, winnerAbbr, loserAbbr });
  });

  return results;
}

function seriesToTeamResults(
  series: { round: PlayoffResult; winnerAbbr: string; loserAbbr: string }[],
  season: string
): TeamPlayoffResult[] {
  const teamResults = new Map<string, TeamPlayoffResult>();
  const depth: Record<PlayoffResult, number> = { R1: 1, R2: 2, CONF: 3, FINALS: 4, CHAMP: 5 };

  function setResult(abbr: string, result: PlayoffResult) {
    const teamId = resolveWnbaTeamId(abbr);
    if (!teamId) return;
    const existing = teamResults.get(teamId);
    if (!existing || depth[result] > depth[existing.playoff_result]) {
      teamResults.set(teamId, {
        team_id: teamId,
        season,
        league: 'WNBA',
        playoff_result: result,
        championship: result === 'CHAMP',
      });
    }
  }

  for (const s of series) {
    setResult(s.loserAbbr, s.round);
    if (s.round === 'FINALS') {
      setResult(s.winnerAbbr, 'CHAMP');
    } else {
      const winnerId = resolveWnbaTeamId(s.winnerAbbr);
      if (winnerId && !teamResults.has(winnerId)) {
        teamResults.set(winnerId, {
          team_id: winnerId,
          season,
          league: 'WNBA',
          playoff_result: s.round,
          championship: false,
        });
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
  const singleYear = yearArg
    ? parseInt(yearArg.includes('=') ? yearArg.split('=')[1] : args[args.indexOf(yearArg) + 1])
    : null;

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const currentYear = new Date().getFullYear();
  const years = singleYear
    ? [singleYear]
    : Array.from({ length: currentYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

  console.log(`Scraping WNBA playoff results for ${years.length} season(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  const allResults: TeamPlayoffResult[] = [];

  for (const year of years) {
    const season = String(year);
    const url = `https://www.basketball-reference.com/wnba/playoffs/${year}.html`;
    console.log(`${season}:`);

    const html = await fetchPage(url, getCachePath(year));
    if (!html) { console.log('  No playoffs page\n'); continue; }

    const series = parseSeries(html);
    if (series.length === 0) {
      console.log('  WARNING: No series found\n');
      continue;
    }

    const teamResults = seriesToTeamResults(series, season);
    const champion = teamResults.find(r => r.championship);

    console.log(`  Series: ${series.length}, Teams: ${teamResults.length}`);
    if (champion) console.log(`  Champion: ${champion.team_id}`);

    if (dryRun) {
      for (const tr of teamResults) {
        console.log(`    ${tr.team_id}: ${tr.playoff_result}${tr.championship ? ' 🏆' : ''}`);
      }
    }

    allResults.push(...teamResults);
    console.log();
  }

  console.log(`Total: ${allResults.length} team-season playoff results`);

  if (dryRun) { console.log('Dry run — no writes.'); return; }

  // Upsert
  console.log('Upserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < allResults.length; i += BATCH) {
    const batch = allResults.slice(i, i + BATCH);
    const { error } = await supabase
      .from('team_seasons')
      .upsert(batch, { onConflict: 'team_id,season' });

    if (error) { console.error(`Batch error: ${error.message}`); errors++; }
    else upserted += batch.length;
  }

  console.log(`Done! Upserted ${upserted} WNBA playoff results (${errors} errors).`);
}

main().catch(console.error);
