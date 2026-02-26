/**
 * Scrape WNBA draft history from Basketball-Reference.
 *
 * URL pattern: https://www.basketball-reference.com/wnba/draft/{YEAR}.html
 *
 * Builds a draft lookup table that can be used to enrich pick assets
 * with became_player_name (same purpose as enrich-picks.ts for NBA).
 *
 * Outputs: data/wnba-draft-data.json
 *   { "2024|1|3": "Caitlin Clark", "2024|2|1": "...", ... }
 *   Key format: "year|round|pick_number"
 *
 * Usage:
 *   npx tsx scripts/scrape-wnba-draft.ts             # All drafts 1997–present
 *   npx tsx scripts/scrape-wnba-draft.ts --year 2024 # Single year
 *   npx tsx scripts/scrape-wnba-draft.ts --dry-run   # Parse only
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { resolveWnbaTeamId } from './lib/wnba-team-resolver';

const CACHE_DIR = path.join(__dirname, '..', 'data', 'wnba-bbref-cache', 'draft');
const OUT_PATH = path.join(__dirname, '..', 'data', 'wnba-draft-data.json');
const RATE_LIMIT_MS = 3100;
const FIRST_YEAR = 1997;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').trim();
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

interface DraftPick {
  year: number;
  round: number;
  pick: number;
  team_id: string | null;
  player_name: string;
}

function parseDraft(html: string, year: number): DraftPick[] {
  const $ = cheerio.load(html);
  const picks: DraftPick[] = [];

  // BBRef WNBA draft page: pick_overall (th), data-stat="team" with full name,
  // team abbreviation in href like /wnba/teams/IND/2024.html
  // No separate round column — derive from pick number + number of teams
  $('table').find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('thead') || $tr.hasClass('over_header')) return;

    const pickCell = $tr.find('[data-stat="pick_overall"]');
    const playerCell = $tr.find('[data-stat="player"]');
    const teamCell = $tr.find('[data-stat="team"]');

    const pick = parseInt(pickCell.text().trim()) || 0;
    const playerName = playerCell.find('a').text().trim() || playerCell.text().trim();
    if (!playerName || playerName === '') return;

    // Extract team abbreviation from href: /wnba/teams/IND/2024.html → IND
    const teamHref = teamCell.find('a').attr('href') || '';
    const abbrMatch = teamHref.match(/\/wnba\/teams\/([A-Z]{2,3})\//);
    const teamAbbr = abbrMatch ? abbrMatch[1] : (teamCell.find('a').text().trim() || teamCell.text().trim());
    const teamId = resolveWnbaTeamId(teamAbbr);

    picks.push({
      year,
      round: 1, // WNBA draft pages show overall pick only; round derived downstream if needed
      pick,
      team_id: teamId,
      player_name: cleanName(playerName),
    });
  });

  return picks;
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

  console.log(`Scraping WNBA draft data for ${years.length} year(s)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  // Load existing data
  let draftData: Record<string, string> = {};
  if (fs.existsSync(OUT_PATH)) {
    draftData = JSON.parse(fs.readFileSync(OUT_PATH, 'utf-8'));
  }

  let totalPicks = 0;
  let allPicks: DraftPick[] = [];

  for (const year of years) {
    console.log(`${year}:`);
    const url = `https://www.basketball-reference.com/wnba/draft/${year}.html`;
    const html = await fetchPage(url, getCachePath(year));

    if (!html) { console.log('  No draft page\n'); continue; }

    const picks = parseDraft(html, year);
    console.log(`  Picks: ${picks.length}`);

    if (dryRun && picks.length > 0) {
      for (const p of picks.slice(0, 5)) {
        console.log(`    R${p.round} #${p.pick}: ${p.player_name} (${p.team_id || '?'})`);
      }
      if (picks.length > 5) console.log(`    ... and ${picks.length - 5} more`);
    }

    // Add to lookup table: "year|round|pick" -> player_name
    for (const p of picks) {
      if (p.pick > 0) {
        draftData[`${p.year}|${p.round}|${p.pick}`] = p.player_name;
      }
      // Also store by team for when we only know year+round+team
      if (p.team_id) {
        draftData[`${p.year}|${p.round}|${p.team_id}`] = p.player_name;
      }
    }

    totalPicks += picks.length;
    allPicks.push(...picks);
    console.log();
  }

  console.log(`Total picks scraped: ${totalPicks}`);
  console.log(`Draft lookup entries: ${Object.keys(draftData).length}`);

  if (dryRun) {
    console.log('Dry run — not writing.');
    return;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(draftData, null, 2));
  console.log(`Wrote ${OUT_PATH}`);

  // Now enrich existing WNBA trade static JSON picks with became_player_name
  const SEASON_DIR = path.join(__dirname, '..', 'public', 'data', 'wnba', 'trades', 'by-season');
  if (!fs.existsSync(SEASON_DIR)) {
    console.log('\nNo WNBA trade data to enrich yet.');
    return;
  }

  const seasonFiles = fs.readdirSync(SEASON_DIR).filter(f => f.endsWith('.json'));
  let enriched = 0;
  let notFound = 0;

  for (const file of seasonFiles) {
    const filePath = path.join(SEASON_DIR, file);
    const trades = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const trade of trades) {
      for (const asset of trade.assets) {
        if (asset.type !== 'pick' || asset.became_player_name) continue;
        if (!asset.pick_year || !asset.pick_round) continue;

        // Try by year|round|team first, then by year|round|pick
        const teamKey = asset.to_team_id
          ? `${asset.pick_year}|${asset.pick_round}|${asset.to_team_id}`
          : null;
        const player = (teamKey && draftData[teamKey]) || null;

        if (player) {
          asset.became_player_name = player;
          enriched++;
          modified = true;
        } else {
          notFound++;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
    }
  }

  console.log(`\nPick enrichment: ${enriched} enriched, ${notFound} not found`);
}

main().catch(console.error);
