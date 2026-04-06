/**
 * Compute Verdict Flips — re-score trades at 1yr, 3yr, and 5yr horizons.
 *
 * Uses the same scoring formula as score-trades.ts but caps eligible seasons
 * to N years after the trade. Compares winners at each horizon to find flips.
 *
 * Reads:   public/data/trades/by-season/*.json
 * Queries: player_seasons, player_accolades, team_seasons
 * Updates: trade_scores (winner_1yr, winner_3yr, winner_5yr, verdict_flipped)
 *
 * PREREQUISITE: Run database/migrations/016-discovery-v2.sql first.
 *
 * Usage:
 *   npx tsx scripts/compute-verdict-flips.ts              # Compute all
 *   npx tsx scripts/compute-verdict-flips.ts --dry-run    # Print flipped trades, no DB writes
 *   npx tsx scripts/compute-verdict-flips.ts --top 30     # Print top 30 flips
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
const DRAW_THRESHOLD = 1.5;

const ACCOLADE_WEIGHTS: Record<string, number> = {
  'MVP': 5.0, 'Finals MVP': 3.0, 'DPOY': 2.5, 'ROY': 1.5,
  'Sixth Man': 0.8, 'MIP': 0.5, 'Clutch POY': 0.3,
  'All-NBA 1st Team': 2.0, 'All-NBA 2nd Team': 1.2, 'All-NBA 3rd Team': 0.7,
  'All-Defensive Team': 0.5, 'All-Rookie Team': 0.2, 'All-Star': 0.3,
};

const SUFFIX_ALIASES: Record<string, string> = {
  'Glen Rice Sr.': 'Glen Rice', 'Tim Hardaway Sr.': 'Tim Hardaway',
  'Patrick Ewing Sr.': 'Patrick Ewing', 'Larry Nance Sr.': 'Larry Nance',
  'Anthony Mason Sr.': 'Anthony Mason', 'Wes Matthews Sr.': 'Wes Matthews',
  'John Lucas Sr.': 'John Lucas', 'Jim Paxson Jr.': 'Jim Paxson',
  'Xavier Tillman Sr.': 'Xavier Tillman', 'Mike Dunleavy Jr.': 'Mike Dunleavy',
};

function resolveStatsName(name: string): string {
  return SUFFIX_ALIASES[name] || name;
}

// ── Types ──

interface TradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  became_player_name: string | null;
}

interface Trade { id: string; date: string; season: string; title: string; assets: TradeAsset[]; }
interface PlayerSeason { player_name: string; team_id: string; season: string; win_shares: number | null; playoff_ws: number | null; }
interface Accolade { player_name: string; accolade: string; season: string; }

function r2(n: number): number { return Math.round(n * 100) / 100; }

function seasonToYear(season: string): number { return parseInt(season.split('-')[0], 10); }

function pickYearToSeason(year: number): string {
  return `${year}-${String(year + 1).slice(2)}`;
}

function getWinPctMultiplier(teamId: string, season: string, teamWinPctMap: Map<string, number>): number {
  return teamWinPctMap.get(`${teamId}|${season}`) ?? 1.0;
}

// ── Bulk loader ──

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

// ── Score a player on a team, capped to maxYears after trade ──

function scorePlayerCapped(
  playerName: string,
  teamId: string,
  seasonCutoff: string,
  tradeYear: number,
  maxYears: number,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
  teamWinPctMap: Map<string, number>,
): number {
  const key = `${resolveStatsName(playerName)}|${teamId}`;
  const eligible = (seasonsByPlayerTeam.get(key) || []).filter(s => {
    if (s.season < seasonCutoff) return false;
    const sYear = seasonToYear(s.season);
    return sYear <= tradeYear + maxYears;
  });

  if (eligible.length === 0) return 0;

  let ws = 0, playoffWs = 0, championshipBonus = 0;
  for (const s of eligible) {
    const mult = getWinPctMultiplier(teamId, s.season, teamWinPctMap);
    ws += (s.win_shares ?? 0) * mult;
    playoffWs += s.playoff_ws ?? 0;
    const champKey = `${teamId}|${s.season}`;
    if (championshipSet.has(champKey)) {
      const teamTotal = teamChampPlayoffWs.get(champKey) || 1;
      championshipBonus += 5.0 * ((s.playoff_ws ?? 0) / teamTotal);
    }
  }

  const seasonSet = new Set(eligible.map(s => s.season));
  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(resolveStatsName(playerName)) || [])) {
    if (seasonSet.has(a.season)) accoladeBonus += ACCOLADE_WEIGHTS[a.accolade] ?? 0;
  }

  return r2(ws + playoffWs * 1.5 + championshipBonus + accoladeBonus);
}

// ── Score a trade at a given time horizon ──

function scoreTradeAtHorizon(
  trade: Trade,
  maxYears: number,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
  teamWinPctMap: Map<string, number>,
): { winner: string | null; scores: Record<string, number> } {
  const tradeYear = seasonToYear(trade.season);
  const teamScores: Record<string, number> = {};

  for (const asset of trade.assets) {
    if (asset.type === 'cash' || asset.type === 'swap') continue;
    const teamId = asset.to_team_id;

    let playerName: string | null = null;
    let seasonCutoff = trade.season;

    if (asset.type === 'player' && asset.player_name) {
      playerName = asset.player_name;
    } else if (asset.type === 'pick' && asset.became_player_name) {
      playerName = asset.became_player_name;
      seasonCutoff = asset.pick_year ? pickYearToSeason(asset.pick_year) : trade.season;
    }

    if (!playerName) continue;

    const score = scorePlayerCapped(
      playerName, teamId, seasonCutoff, tradeYear, maxYears,
      seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs, teamWinPctMap,
    );

    teamScores[teamId] = (teamScores[teamId] || 0) + score;
  }

  // Determine winner
  const sorted = Object.entries(teamScores).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return { winner: null, scores: teamScores };

  const margin = sorted[0][1] - sorted[1][1];
  const winner = margin >= DRAW_THRESHOLD ? sorted[0][0] : null;

  return { winner, scores: teamScores };
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const topArg = args.find(a => a.startsWith('--top'));
  const topN = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;

  console.log('Computing Verdict Flips...\n');
  console.log('Loading Supabase data...');

  const [playerSeasons, accolades, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<Accolade>('player_accolades', 'player_name,accolade,season'),
    fetchAll<{ team_id: string; season: string; wins: number | null; losses: number | null; championship: boolean }>('team_seasons', 'team_id,season,wins,losses,championship'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length}`);
  console.log(`  accolades: ${accolades.length}`);

  const seasonsByPlayerTeam = new Map<string, PlayerSeason[]>();
  for (const row of playerSeasons) {
    const key = `${row.player_name}|${row.team_id}`;
    if (!seasonsByPlayerTeam.has(key)) seasonsByPlayerTeam.set(key, []);
    seasonsByPlayerTeam.get(key)!.push(row);
  }

  const accoladesByPlayer = new Map<string, Accolade[]>();
  for (const row of accolades) {
    if (!accoladesByPlayer.has(row.player_name)) accoladesByPlayer.set(row.player_name, []);
    accoladesByPlayer.get(row.player_name)!.push(row);
  }

  const championshipSet = new Set<string>(
    teamSeasons.filter(r => r.championship).map(r => `${r.team_id}|${r.season}`)
  );

  const teamChampPlayoffWs = new Map<string, number>();
  for (const row of playerSeasons) {
    const champKey = `${row.team_id}|${row.season}`;
    if (championshipSet.has(champKey)) {
      teamChampPlayoffWs.set(champKey, (teamChampPlayoffWs.get(champKey) || 0) + (row.playoff_ws ?? 0));
    }
  }

  const teamWinPctMap = new Map<string, number>();
  for (const row of teamSeasons) {
    if (row.wins != null && row.losses != null) {
      const total = row.wins + row.losses;
      if (total > 0) {
        teamWinPctMap.set(`${row.team_id}|${row.season}`, Math.min(1.0, (row.wins / total) * 2));
      }
    }
  }

  // Load trades
  const allSeasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json').sort();
  const allTrades: Trade[] = [];
  for (const file of allSeasonFiles) {
    allTrades.push(...JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[]);
  }
  console.log(`\n${allTrades.length} trades loaded.\n`);

  // Only score trades old enough for 5yr horizon (trade year + 5 < current)
  const currentYear = new Date().getFullYear();
  const eligibleTrades = allTrades.filter(t => seasonToYear(t.season) + 5 <= currentYear);
  console.log(`${eligibleTrades.length} trades eligible (5yr+ old).\n`);

  interface FlipResult {
    trade_id: string;
    season: string;
    title: string;
    winner_1yr: string | null;
    winner_3yr: string | null;
    winner_5yr: string | null;
    flipped: boolean;
    scores_1yr: Record<string, number>;
    scores_5yr: Record<string, number>;
  }

  const results: FlipResult[] = [];
  let processed = 0;

  for (const trade of eligibleTrades) {
    const h1 = scoreTradeAtHorizon(trade, 1, seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs, teamWinPctMap);
    const h3 = scoreTradeAtHorizon(trade, 3, seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs, teamWinPctMap);
    const h5 = scoreTradeAtHorizon(trade, 5, seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs, teamWinPctMap);

    const flipped = !!(h1.winner && h5.winner && h1.winner !== h5.winner);

    results.push({
      trade_id: trade.id,
      season: trade.season,
      title: trade.title,
      winner_1yr: h1.winner,
      winner_3yr: h3.winner,
      winner_5yr: h5.winner,
      flipped,
      scores_1yr: h1.scores,
      scores_5yr: h5.scores,
    });

    processed++;
    if (processed % 500 === 0) process.stdout.write(`  ${processed}/${eligibleTrades.length}...\n`);
  }

  const flippedCount = results.filter(r => r.flipped).length;
  const withBothWinners = results.filter(r => r.winner_1yr && r.winner_5yr).length;
  console.log(`\nDone. ${results.length} trades scored at 3 horizons.`);
  console.log(`  Both 1yr & 5yr winners: ${withBothWinners}`);
  console.log(`  Verdict flipped: ${flippedCount} (${withBothWinners > 0 ? Math.round(flippedCount / withBothWinners * 100) : 0}%)\n`);

  // Sort flipped trades by magnitude of the 5yr swing
  const flippedTrades = results
    .filter(r => r.flipped)
    .sort((a, b) => {
      // Sort by 5yr score gap (how decisively the verdict reversed)
      const gapA = Object.values(a.scores_5yr).sort((x, y) => y - x);
      const gapB = Object.values(b.scores_5yr).sort((x, y) => y - x);
      const marginA = gapA.length >= 2 ? gapA[0] - gapA[1] : 0;
      const marginB = gapB.length >= 2 ? gapB[0] - gapB[1] : 0;
      return marginB - marginA;
    });

  const printCount = topN || (dryRun ? 30 : 0);
  if (printCount > 0) {
    console.log(`Top ${Math.min(printCount, flippedTrades.length)} Verdict Flips:\n`);
    for (let i = 0; i < Math.min(printCount, flippedTrades.length); i++) {
      const r = flippedTrades[i];
      console.log(`#${i + 1}  [${r.season}] ${r.title || r.trade_id.slice(-12)}`);
      console.log(`    1yr winner: ${r.winner_1yr}  →  3yr: ${r.winner_3yr}  →  5yr: ${r.winner_5yr}`);
      const s1 = Object.entries(r.scores_1yr).map(([t, s]) => `${t}:${s.toFixed(1)}`).join(' vs ');
      const s5 = Object.entries(r.scores_5yr).map(([t, s]) => `${t}:${s.toFixed(1)}`).join(' vs ');
      console.log(`    1yr scores: ${s1}`);
      console.log(`    5yr scores: ${s5}`);
      console.log('');
    }
  }

  if (dryRun) {
    console.log('Dry run — no database writes.');
    return;
  }

  // Update trade_scores
  console.log('Updating trade_scores...');
  let updated = 0, errors = 0;

  for (const r of results) {
    const { error } = await supabase
      .from('trade_scores')
      .update({
        winner_1yr: r.winner_1yr,
        winner_3yr: r.winner_3yr,
        winner_5yr: r.winner_5yr,
        verdict_flipped: r.flipped,
      })
      .eq('trade_id', r.trade_id);

    if (error) errors++;
    else updated++;
  }

  console.log(`Done! Updated ${updated} rows (${errors} errors).`);
}

main().catch(console.error);
