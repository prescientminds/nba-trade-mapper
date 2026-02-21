/**
 * Score every NBA trade by value each team received.
 *
 * Reads:   public/data/trades/by-season/*.json
 * Queries: player_seasons, player_accolades, team_seasons (bulk loaded)
 * Upserts: trade_scores table
 *
 * PREREQUISITE: Run database/migrations/006-trade-scores.sql first.
 *   → Supabase SQL Editor: https://supabase.com/dashboard/project/izvnmsrjygshtperrwqk/sql/new
 *
 * Value formula per player asset (while on receiving team, post-trade):
 *   score = win_shares
 *         + vorp × 0.5
 *         + playoff_ws × 1.5
 *         + championships × 5.0
 *         + accolade_bonus
 *
 * Accolade bonuses:
 *   MVP=5, DPOY=2.5, ROY=1.5, All-NBA 1st=2, 2nd=1.2, 3rd=0.7,
 *   All-Star=0.3, All-Defensive=0.5, Sixth Man=0.8, MIP=0.5
 *
 * Usage:
 *   npx tsx scripts/score-trades.ts                    # Score all trades
 *   npx tsx scripts/score-trades.ts --dry-run          # Print results, no DB writes
 *   npx tsx scripts/score-trades.ts --season 2020-21   # Single season only
 *   npx tsx scripts/score-trades.ts --top 20           # Print 20 most lopsided trades
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Constants ─────────────────────────────────────────────────────────────────

const TRADES_DIR = path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');

const ACCOLADE_WEIGHTS: Record<string, number> = {
  'MVP':               5.0,
  'DPOY':              2.5,
  'ROY':               1.5,
  'Sixth Man':         0.8,
  'MIP':               0.5,
  'Clutch POY':        0.3,
  'All-NBA 1st Team':  2.0,
  'All-NBA 2nd Team':  1.2,
  'All-NBA 3rd Team':  0.7,
  'All-Defensive Team': 0.5,
  'All-Rookie Team':   0.2,
  'All-Star':          0.3,
};

// Below this score margin, no clear winner is declared.
const DRAW_THRESHOLD = 1.5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradeAsset {
  type: 'player' | 'pick';
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  pick_round: number | null;
  became_player_name: string | null;
}

interface Trade {
  id: string;
  date: string;
  season: string;
  title: string;
  assets: TradeAsset[];
}

interface PlayerSeason {
  player_name: string;
  team_id: string;
  season: string;
  win_shares: number | null;
  vorp: number | null;
  playoff_ws: number | null;
}

interface Accolade {
  player_name: string;
  accolade: string;
  season: string;
}

interface AssetScore {
  name: string;
  type: 'player' | 'pick';
  seasons: number;
  ws: number;
  vorp: number;
  playoff_ws: number;
  championships: number;
  accolades: string[];
  accolade_bonus: number;
  score: number;
}

interface TeamScore {
  score: number;
  assets: AssetScore[];
}

interface TradeScore {
  trade_id: string;
  season: string;
  team_scores: Record<string, TeamScore>;
  winner: string | null;
  lopsidedness: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert pick_year (draft year) to the season string when the player first plays. */
function pickYearToSeason(year: number): string {
  return `${year}-${String(year + 1).slice(2)}`;
}

// ── Bulk data loaders ─────────────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  // Supabase PostgREST caps responses at 1000 rows by default.
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE) break;  // Last page — done
    from += PAGE;
  }

  return rows;
}

// ── Scoring logic ─────────────────────────────────────────────────────────────

function scorePlayer(
  playerName: string,
  receivingTeamId: string,
  seasonCutoff: string,    // Include seasons >= this string
  assetType: 'player' | 'pick',
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,  // "team_id|season" strings
): AssetScore {
  const key = `${playerName}|${receivingTeamId}`;
  const eligibleSeasons = (seasonsByPlayerTeam.get(key) || [])
    .filter(s => s.season >= seasonCutoff);

  // Season strings this player was on this team post-trade (for accolade filtering)
  const seasonSet = new Set(eligibleSeasons.map(s => s.season));

  let ws = 0, vorp = 0, playoffWs = 0, championships = 0;
  for (const s of eligibleSeasons) {
    ws       += s.win_shares  ?? 0;
    vorp     += s.vorp        ?? 0;
    playoffWs += s.playoff_ws ?? 0;
    if (championshipSet.has(`${receivingTeamId}|${s.season}`)) championships++;
  }

  // Accolades earned while on this team
  const accolades: string[] = [];
  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(playerName) || [])) {
    if (!seasonSet.has(a.season)) continue;
    const w = ACCOLADE_WEIGHTS[a.accolade] ?? 0;
    if (w > 0) {
      accoladeBonus += w;
      accolades.push(a.accolade);
    }
  }

  const score = r2(ws + vorp * 0.5 + playoffWs * 1.5 + championships * 5.0 + accoladeBonus);

  return {
    name: playerName,
    type: assetType,
    seasons: eligibleSeasons.length,
    ws: r2(ws),
    vorp: r2(vorp),
    playoff_ws: r2(playoffWs),
    championships,
    accolades,
    accolade_bonus: r2(accoladeBonus),
    score,
  };
}

function scoreTrade(
  trade: Trade,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
): TradeScore {
  // Group assets by receiving team
  const byTeam = new Map<string, TradeAsset[]>();
  for (const asset of trade.assets) {
    if (!byTeam.has(asset.to_team_id)) byTeam.set(asset.to_team_id, []);
    byTeam.get(asset.to_team_id)!.push(asset);
  }

  const teamScores: Record<string, TeamScore> = {};

  for (const [teamId, assets] of byTeam) {
    const scored: AssetScore[] = [];

    for (const asset of assets) {
      let playerName: string | null = null;
      let assetType: 'player' | 'pick' = 'player';
      let seasonCutoff = trade.season;

      if (asset.type === 'player' && asset.player_name) {
        playerName = asset.player_name;
      } else if (asset.type === 'pick' && asset.became_player_name) {
        playerName = asset.became_player_name;
        assetType = 'pick';
        // Player's first season with the team = the season after they were drafted
        seasonCutoff = asset.pick_year ? pickYearToSeason(asset.pick_year) : trade.season;
      }

      if (!playerName) continue;  // Unresolved pick — no stats to score

      const assetScore = scorePlayer(
        playerName,
        teamId,
        seasonCutoff,
        assetType,
        seasonsByPlayerTeam,
        accoladesByPlayer,
        championshipSet,
      );

      scored.push(assetScore);
    }

    const teamTotal = r2(scored.reduce((sum, a) => sum + a.score, 0));
    teamScores[teamId] = { score: teamTotal, assets: scored };
  }

  // Determine winner
  const entries = Object.entries(teamScores).sort((a, b) => b[1].score - a[1].score);
  let winner: string | null = null;
  let lopsidedness = 0;

  if (entries.length >= 2) {
    lopsidedness = r2(entries[0][1].score - entries[entries.length - 1][1].score);
    if (lopsidedness >= DRAW_THRESHOLD) {
      winner = entries[0][0];
    }
  } else if (entries.length === 1) {
    winner = entries[0][0];
    lopsidedness = r2(entries[0][1].score);
  }

  return {
    trade_id: trade.id,
    season: trade.season,
    team_scores: teamScores,
    winner,
    lopsidedness,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const topArg  = args.find(a => a.startsWith('--top'));
  const topN    = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;
  const seasonArg = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;

  console.log('Loading Supabase data...');

  const [playerSeasons, accolades, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,vorp,playoff_ws'),
    fetchAll<Accolade>('player_accolades', 'player_name,accolade,season'),
    fetchAll<{ team_id: string; season: string; championship: boolean }>('team_seasons', 'team_id,season,championship'),
  ]);

  console.log(`  player_seasons: ${playerSeasons.length} rows`);
  console.log(`  player_accolades: ${accolades.length} rows`);
  console.log(`  team_seasons: ${teamSeasons.length} rows`);

  // Build lookup indexes
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
  console.log(`  Championships indexed: ${championshipSet.size}\n`);

  // Load trade JSON files
  const seasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .filter(f => !singleSeason || f === `${singleSeason}.json`)
    .sort();

  const allTrades: Trade[] = [];
  for (const file of seasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} trades from ${seasonFiles.length} season file(s).`);

  // Score each trade
  const results: TradeScore[] = [];
  for (const trade of allTrades) {
    results.push(scoreTrade(trade, seasonsByPlayerTeam, accoladesByPlayer, championshipSet));
  }

  // Summary stats
  const withWinner = results.filter(r => r.winner !== null).length;
  const noData = results.filter(r => Object.values(r.team_scores).every(ts => ts.score === 0)).length;
  console.log(`\nScored ${results.length} trades.`);
  console.log(`  Clear winner:     ${withWinner} (${Math.round(withWinner / results.length * 100)}%)`);
  console.log(`  Effectively even: ${results.length - withWinner - noData}`);
  console.log(`  No player data:   ${noData}`);

  // --top N: print most lopsided trades
  const printCount = topN || (dryRun ? 20 : 0);
  if (printCount > 0) {
    console.log(`\nTop ${printCount} most lopsided trades:`);
    const sorted = [...results].sort((a, b) => b.lopsidedness - a.lopsidedness);
    for (const r of sorted.slice(0, printCount)) {
      const teams = Object.entries(r.team_scores)
        .sort((a, b) => b[1].score - a[1].score)
        .map(([tid, ts]) => `${tid} ${ts.score.toFixed(1)}`);
      console.log(`  [${r.season}] ${r.trade_id.slice(-8)}  ${teams.join(' vs ')}  margin=${r.lopsidedness.toFixed(1)}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — no database writes.');
    return;
  }

  // Upsert to trade_scores
  console.log('\nUpserting to Supabase...');
  const BATCH = 200;
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH).map(r => ({
      trade_id:     r.trade_id,
      season:       r.season,
      team_scores:  r.team_scores,
      winner:       r.winner,
      lopsidedness: r.lopsidedness,
    }));

    const { error } = await supabase
      .from('trade_scores')
      .upsert(batch, { onConflict: 'trade_id' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`Done! Upserted ${upserted} trade scores (${errors} batch errors).`);
}

main().catch(console.error);
