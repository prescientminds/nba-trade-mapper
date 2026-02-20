/**
 * Daily BBRef scrape — fetch today's transactions and update static JSON.
 *
 * Designed to run via GitHub Action daily at 6am ET.
 * Only fetches the current day's page, so it's fast (~1 request).
 *
 * Usage: npx tsx scripts/scrape-today.ts
 */

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveTeamId, dateToSeason } from './lib/team-resolver';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data', 'trades');
const SEASON_DIR = path.join(OUT_DIR, 'by-season');

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

function generateTradeId(date: string, teamIds: string[]): string {
  const sorted = [...teamIds].sort().join('-');
  const hash = crypto.createHash('md5').update(`${date}|${sorted}`).digest('hex').slice(0, 8);
  return `bbref-${date}-${hash}`;
}

async function main() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  const today = now.toISOString().split('T')[0];

  console.log(`Scraping BBRef for ${month}/${day}/${year}...`);

  const url = `https://www.basketball-reference.com/friv/transactions.fcgi?month=${month}&day=${day}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!resp.ok) {
    console.error(`HTTP ${resp.status}`);
    process.exit(1);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Load existing season file
  const season = dateToSeason(today);
  const seasonPath = path.join(SEASON_DIR, `${season}.json`);
  let seasonTrades: StaticTrade[] = [];
  if (fs.existsSync(seasonPath)) {
    seasonTrades = JSON.parse(fs.readFileSync(seasonPath, 'utf-8'));
  }

  let added = 0;

  // Find current year's section
  const yearHeaders = $('h2');
  yearHeaders.each((_, h2) => {
    const yearText = $(h2).text().trim();
    if (!yearText.includes(String(year))) return;

    const ul = $(h2).next('ul');
    if (!ul.length) return;

    ul.find('li').each((_, li) => {
      const text = $(li).text().trim();
      if (!text.toLowerCase().includes('traded')) return;

      // Extract teams
      const teamsInTrade = new Set<string>();
      $(li).find('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        const teamMatch = href.match(/\/teams\/([A-Z]{3})\//);
        if (teamMatch) {
          const tid = resolveTeamId(teamMatch[1]);
          if (tid) teamsInTrade.add(tid);
        }
      });

      if (teamsInTrade.size < 2) return;

      const teamArr = [...teamsInTrade];
      const tradeId = generateTradeId(today, teamArr);

      // Check for dupe
      if (seasonTrades.some((t) => t.id === tradeId)) return;

      // Extract players
      const players: string[] = [];
      $(li).find('a').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (href.includes('/players/')) {
          players.push($(a).text().trim());
        }
      });

      const title = players.length > 0
        ? `${players.slice(0, 3).join(', ')} Trade`
        : `${teamArr.join(' / ')} Trade`;

      const assets: StaticTradeAsset[] = [];
      for (const name of players) {
        assets.push({
          type: 'player',
          player_name: name,
          from_team_id: teamArr[0] || null,
          to_team_id: teamArr[1] || null,
          pick_year: null,
          pick_round: null,
          original_team_id: null,
          became_player_name: null,
          notes: null,
        });
      }

      // Check for picks
      const pickMatches = text.matchAll(
        /(\d{4})\s+(1st|2nd|first|second)\s+round\s+(?:draft\s+)?pick/gi
      );
      for (const m of pickMatches) {
        assets.push({
          type: 'pick',
          player_name: null,
          from_team_id: null,
          to_team_id: null,
          pick_year: parseInt(m[1]),
          pick_round: /1st|first/i.test(m[2]) ? 1 : 2,
          original_team_id: null,
          became_player_name: null,
          notes: null,
        });
      }

      if (assets.length === 0) return;

      seasonTrades.push({
        id: tradeId,
        date: today,
        season,
        title,
        description: text.replace(/\s+/g, ' ').trim(),
        is_multi_team: teamsInTrade.size > 2,
        teams: teamArr.map((t) => ({ team_id: t, role: 'participant' })),
        assets,
      });

      added++;
    });
  });

  if (added === 0) {
    console.log('No new trades found today.');
    return;
  }

  // Write updated season file
  fs.mkdirSync(SEASON_DIR, { recursive: true });
  seasonTrades.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(seasonPath, JSON.stringify(seasonTrades, null, 2));

  // Rebuild index
  const allSeasonFiles = fs.readdirSync(SEASON_DIR).filter((f) => f.endsWith('.json'));
  const newIndex: SearchIndexEntry[] = [];

  for (const file of allSeasonFiles) {
    const trades: StaticTrade[] = JSON.parse(
      fs.readFileSync(path.join(SEASON_DIR, file), 'utf-8')
    );
    for (const t of trades) {
      const players = t.assets
        .filter((a) => a.player_name)
        .map((a) => a.player_name!)
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

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(newIndex));

  console.log(`Added ${added} new trade(s). Season ${season} now has ${seasonTrades.length} trades.`);
  console.log(`Index: ${newIndex.length} total entries.`);
}

main().catch(console.error);
