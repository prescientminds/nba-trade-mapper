/**
 * Compute recursive "chain value" for every NBA trade.
 *
 * For each asset a team received in a trade, chain value asks:
 *   - How much did that asset produce while on this team? (direct)
 *   - Did this team later trade that asset away? If so, what did they get?
 *   - And what did THOSE assets produce, and what did they get traded for?
 *   ... recursively, until assets retire on a team or the chain reaches MAX_DEPTH.
 *
 * Reads:   public/data/trades/by-season/*.json
 * Queries: player_seasons, player_accolades, team_seasons (bulk loaded)
 * Upserts: trade_chain_scores table (migration 007)
 *
 * PREREQUISITE: Run database/migrations/007-chain-scores.sql first.
 *
 * Value formula (same as score-trades.ts):
 *   score = win_shares + playoff_ws×1.5 + championship_bonus(contribution-weighted) + accolade_bonus
 *
 * Stored metadata (for discovery page filtering):
 *   max_chain_score   — highest chain total across teams in the trade
 *   max_chain_breadth — most downstream assets any team accumulated
 *   max_chain_depth   — deepest hop count
 *
 * Usage:
 *   npx tsx scripts/compute-chain-scores.ts                    # Compute all
 *   npx tsx scripts/compute-chain-scores.ts --dry-run          # Print top results, no DB writes
 *   npx tsx scripts/compute-chain-scores.ts --season 2003-04   # Single season
 *   npx tsx scripts/compute-chain-scores.ts --top 20           # Print 20 deepest chains
 *   npx tsx scripts/compute-chain-scores.ts --min-breadth 5    # Only chains with 5+ assets
 */

import * as fs from 'fs';
import * as path from 'path';
import { supabase } from './lib/supabase-admin';

// ── Constants ─────────────────────────────────────────────────────────────────

// Set in main() based on --league flag
let LEAGUE = 'NBA';

function getTradesDir(): string {
  if (LEAGUE === 'WNBA') {
    return path.join(__dirname, '..', 'public', 'data', 'wnba', 'trades', 'by-season');
  }
  return path.join(__dirname, '..', 'public', 'data', 'trades', 'by-season');
}
const MAX_DEPTH = 12;  // Prevent runaway recursion on unusual trade loops

const ACCOLADE_WEIGHTS: Record<string, number> = {
  'MVP':                5.0,
  'Finals MVP':         3.0,
  'DPOY':               2.5,
  'ROY':                1.5,
  'Sixth Man':          0.8,
  'MIP':                0.5,
  'Clutch POY':         0.3,
  'All-NBA 1st Team':   2.0,
  'All-NBA 2nd Team':   1.2,
  'All-NBA 3rd Team':   0.7,
  'All-Defensive Team': 0.5,
  'All-Rookie Team':    0.2,
  'All-Star':           0.3,
  // WNBA accolades
  'All-WNBA Team':     1.2,
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TradeAsset {
  type: 'player' | 'pick' | 'swap' | 'cash';
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
  playoff_ws: number | null;
}

interface Accolade {
  player_name: string;
  accolade: string;
  season: string;
}

// ── Chain tree node (what we store in JSONB) ──────────────────────────────────

interface ChainNode {
  name: string;
  type: 'player' | 'pick';
  direct: number;         // Score produced directly on this team
  chain: number;          // direct + fractional share of descendants
  exit_trade_id: string | null;
  fraction: number;       // 1/N where N = assets sent alongside in exit trade
  children: ChainNode[];
}

interface TeamChain {
  direct: number;         // Sum of direct scores for top-level received assets
  chain: number;          // Full recursive total
  depth: number;          // Max chain depth reached
  asset_count: number;    // Total distinct named assets in tree (including descendants)
  max_single_asset: number;  // Highest single-asset chain contribution (outlier detector)
  assets: ChainNode[];    // Top-level received assets with their subtrees
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickYearToSeason(year: number): string {
  if (LEAGUE === 'WNBA') return String(year);
  return `${year}-${String(year + 1).slice(2)}`;
}

function countAssets(nodes: ChainNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countAssets(node.children);
  }
  return count;
}

function maxDepth(nodes: ChainNode[], current = 0): number {
  if (nodes.length === 0) return current;
  return Math.max(...nodes.map(n => maxDepth(n.children, current + 1)));
}

function maxSingleAsset(nodes: ChainNode[]): number {
  let best = 0;
  for (const node of nodes) {
    best = Math.max(best, node.chain, maxSingleAsset(node.children));
  }
  return best;
}

// ── Bulk data loaders ─────────────────────────────────────────────────────────

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

// ── Score a player while on a given team after a cutoff season ────────────────

function scorePlayer(
  playerName: string,
  teamId: string,
  seasonCutoff: string,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
): number {
  const key = `${playerName}|${teamId}`;
  const eligible = (seasonsByPlayerTeam.get(key) || []).filter(s => s.season >= seasonCutoff);
  const seasonSet = new Set(eligible.map(s => s.season));

  let ws = 0, playoffWs = 0, championshipBonus = 0;
  for (const s of eligible) {
    ws        += s.win_shares ?? 0;
    playoffWs += s.playoff_ws ?? 0;
    const champKey = `${teamId}|${s.season}`;
    if (championshipSet.has(champKey)) {
      const teamTotal = teamChampPlayoffWs.get(champKey) || 1;
      championshipBonus += 5.0 * ((s.playoff_ws ?? 0) / teamTotal);
    }
  }

  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(playerName) || [])) {
    if (seasonSet.has(a.season)) {
      accoladeBonus += ACCOLADE_WEIGHTS[a.accolade] ?? 0;
    }
  }

  return r2(ws + playoffWs * 1.5 + championshipBonus + accoladeBonus);
}

// ── Score a player's FULL career (all teams) after a cutoff season ────────────

function scorePlayerCareer(
  playerName: string,
  seasonCutoff: string,
  seasonsByPlayer: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
): number {
  const eligible = (seasonsByPlayer.get(playerName) || []).filter(s => s.season >= seasonCutoff);
  if (eligible.length === 0) return 0;

  let ws = 0, playoffWs = 0, championshipBonus = 0;
  // Track championship seasons to avoid double-counting if player was traded mid-season
  const champSeasonsCounted = new Set<string>();
  for (const s of eligible) {
    ws        += s.win_shares ?? 0;
    playoffWs += s.playoff_ws ?? 0;
    const champKey = `${s.team_id}|${s.season}`;
    if (championshipSet.has(champKey) && !champSeasonsCounted.has(s.season)) {
      champSeasonsCounted.add(s.season);
      const teamTotal = teamChampPlayoffWs.get(champKey) || 1;
      championshipBonus += 5.0 * ((s.playoff_ws ?? 0) / teamTotal);
    }
  }

  const seasonSet = new Set(eligible.map(s => s.season));
  let accoladeBonus = 0;
  for (const a of (accoladesByPlayer.get(playerName) || [])) {
    if (seasonSet.has(a.season)) {
      accoladeBonus += ACCOLADE_WEIGHTS[a.accolade] ?? 0;
    }
  }

  return r2(ws + playoffWs * 1.5 + championshipBonus + accoladeBonus);
}

// ── Index: for each (playerName, fromTeamId), sorted exit trades by date ──────
//
// Returns the earliest exit trade AFTER arrivedDate so we follow the correct
// stint even when a player returns to a team via FA and gets traded again later.

function findExitTrade(
  playerName: string,
  teamId: string,
  arrivedDate: string,
  exitTradeIndex: Map<string, Trade[]>,
): Trade | null {
  const key = `${playerName}|${teamId}`;
  const candidates = exitTradeIndex.get(key) || [];
  // Sorted ascending by date — find first one strictly after arrival
  return candidates.find(t => t.date > arrivedDate) ?? null;
}

// ── Pick exit trade index: for draft picks re-traded before the draft ────────
//
// When a team receives a pick (e.g., "2017 R1 from BKN") and trades that pick
// before the draft, the became_player_name was never on this team. The player
// exit index won't find them. This index finds trades where a pick with the
// same year+round was sent FROM this team, keyed by "year-round-fromTeamId".

function findPickExitTrade(
  pickYear: number,
  pickRound: number,
  teamId: string,
  arrivedDate: string,
  pickExitIndex: Map<string, Trade[]>,
): Trade | null {
  const key = `${pickYear}-${pickRound}-${teamId}`;
  const candidates = pickExitIndex.get(key) || [];
  return candidates.find(t => t.date > arrivedDate) ?? null;
}

// ── Recursive chain computation ────────────────────────────────────────────────

function computeChain(
  playerName: string,
  teamId: string,
  arrivedDate: string,
  seasonCutoff: string,
  type: 'player' | 'pick',
  depth: number,
  visited: Set<string>,
  exitTradeIndex: Map<string, Trade[]>,
  pickExitIndex: Map<string, Trade[]>,
  pickYear: number | null,
  pickRound: number | null,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
): ChainNode {
  const direct = scorePlayer(
    playerName, teamId, seasonCutoff,
    seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
  );

  // Stop recursion at max depth or if we've already walked this (playerName, teamId, arrivedDate)
  const visitKey = `${playerName}|${teamId}|${arrivedDate}`;
  if (depth >= MAX_DEPTH || visited.has(visitKey)) {
    return { name: playerName, type, direct, chain: direct, exit_trade_id: null, fraction: 1, children: [] };
  }
  visited.add(visitKey);

  // Try player exit trade first
  let exitTrade = findExitTrade(playerName, teamId, arrivedDate, exitTradeIndex);

  // If no player exit trade and this is a pick with 0 direct production,
  // the pick was likely re-traded before the draft. Look for a pick exit trade.
  if (!exitTrade && type === 'pick' && direct === 0 && pickYear && pickRound) {
    exitTrade = findPickExitTrade(pickYear, pickRound, teamId, arrivedDate, pickExitIndex);
  }

  if (!exitTrade) {
    return { name: playerName, type, direct, chain: direct, exit_trade_id: null, fraction: 1, children: [] };
  }

  // Fractional attribution: if this asset left alongside N other assets, it is
  // only responsible for 1/N of what came back. Prevents fan-out explosion where
  // multi-player trades cause every asset to "own" the full value of all returnees.
  const outgoingCount = exitTrade.assets.filter(a =>
    a.from_team_id === teamId && a.type !== 'cash' && a.type !== 'swap'
  ).length;
  const fraction = outgoingCount > 1 ? 1 / outgoingCount : 1;

  // What did teamId receive in the exit trade?
  const receivedAssets = exitTrade.assets.filter(a => a.to_team_id === teamId);
  const children: ChainNode[] = [];

  for (const asset of receivedAssets) {
    if (asset.type === 'cash' || asset.type === 'swap') continue;

    if (asset.type === 'player' && asset.player_name) {
      children.push(computeChain(
        asset.player_name, teamId, exitTrade.date, exitTrade.season,
        'player', depth + 1, visited,
        exitTradeIndex, pickExitIndex, null, null,
        seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
      ));
    } else if (asset.type === 'pick' && asset.became_player_name) {
      // Pick resolves to a player — their stats start the season after the draft
      const pickSeason = asset.pick_year ? pickYearToSeason(asset.pick_year) : exitTrade.season;
      children.push(computeChain(
        asset.became_player_name, teamId, exitTrade.date, pickSeason,
        'pick', depth + 1, visited,
        exitTradeIndex, pickExitIndex, asset.pick_year, asset.pick_round,
        seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
      ));
    }
    // Unresolved picks (no became_player_name) contribute nothing
  }

  const chainTotal = r2(direct + fraction * children.reduce((s, c) => s + c.chain, 0));

  return {
    name: playerName,
    type,
    direct,
    chain: chainTotal,
    exit_trade_id: exitTrade.id,
    fraction,
    children,
  };
}

// ── Score one trade for all receiving teams ────────────────────────────────────

function scoreTradeChain(
  trade: Trade,
  exitTradeIndex: Map<string, Trade[]>,
  pickExitIndex: Map<string, Trade[]>,
  seasonsByPlayerTeam: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
): Record<string, TeamChain> {
  // Group assets by receiving team
  const byTeam = new Map<string, TradeAsset[]>();
  for (const asset of trade.assets) {
    if (asset.type === 'cash' || asset.type === 'swap') continue;
    if (!byTeam.has(asset.to_team_id)) byTeam.set(asset.to_team_id, []);
    byTeam.get(asset.to_team_id)!.push(asset);
  }

  const result: Record<string, TeamChain> = {};

  for (const [teamId, assets] of byTeam) {
    // Each recursive walk gets its own visited set per top-level asset to allow
    // the same player to appear in multiple independent branches (e.g., traded back).
    const topLevelNodes: ChainNode[] = [];

    for (const asset of assets) {
      let playerName: string | null = null;
      let assetType: 'player' | 'pick' = 'player';
      let seasonCutoff = trade.season;

      if (asset.type === 'player' && asset.player_name) {
        playerName = asset.player_name;
      } else if (asset.type === 'pick' && asset.became_player_name) {
        playerName = asset.became_player_name;
        assetType = 'pick';
        seasonCutoff = asset.pick_year ? pickYearToSeason(asset.pick_year) : trade.season;
      }

      if (!playerName) continue;

      const visited = new Set<string>();
      const node = computeChain(
        playerName, teamId, trade.date, seasonCutoff, assetType,
        0, visited,
        exitTradeIndex, pickExitIndex,
        assetType === 'pick' ? asset.pick_year : null,
        assetType === 'pick' ? asset.pick_round : null,
        seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
      );
      topLevelNodes.push(node);
    }

    const directTotal = r2(topLevelNodes.reduce((s, n) => s + n.direct, 0));
    const chainTotal  = r2(topLevelNodes.reduce((s, n) => s + n.chain, 0));

    result[teamId] = {
      direct: directTotal,
      chain: chainTotal,
      depth: maxDepth(topLevelNodes),
      asset_count: countAssets(topLevelNodes),
      max_single_asset: r2(maxSingleAsset(topLevelNodes)),
      assets: topLevelNodes,
    };
  }

  return result;
}

// ── League impact: total career value across ALL teams from a trade cascade ───

interface LeagueImpactResult {
  impact: number;
  playerCount: number;
  depth: number;
  topPlayers: { name: string; score: number }[];
}

function computeLeagueImpact(
  trade: Trade,
  exitTradeIndex: Map<string, Trade[]>,
  pickExitIndex: Map<string, Trade[]>,
  seasonsByPlayer: Map<string, PlayerSeason[]>,
  accoladesByPlayer: Map<string, Accolade[]>,
  championshipSet: Set<string>,
  teamChampPlayoffWs: Map<string, number>,
): LeagueImpactResult {
  const visitedPlayers = new Set<string>();
  const playerScores: { name: string; score: number }[] = [];

  // Walk a player: score their full career, then follow their exit trade
  // from each team they were traded to. Only follows the directed trade graph
  // (player arrives at team → gets traded away → new players arrive).
  function walkAsset(
    playerName: string,
    teamId: string,
    arrivedDate: string,
    seasonCutoff: string,
    depth: number,
  ): number {
    // Score this player's full career (all teams) if not already counted
    if (!visitedPlayers.has(playerName)) {
      visitedPlayers.add(playerName);
      const score = scorePlayerCareer(
        playerName, seasonCutoff,
        seasonsByPlayer, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
      );
      if (score > 0) {
        playerScores.push({ name: playerName, score });
      }
    }

    if (depth >= MAX_DEPTH) return depth;

    // Find this player's exit trade from teamId
    const exitTrade = findExitTrade(playerName, teamId, arrivedDate, exitTradeIndex);
    if (!exitTrade) return depth;

    // Follow all assets received by teamId in the exit trade (what came back)
    // AND follow the player to their new team (cross-team tracking)
    let maxDepth = depth;

    // 1. Assets received by teamId (the return haul)
    const received = exitTrade.assets.filter(a => a.to_team_id === teamId);
    for (const asset of received) {
      if (asset.type === 'cash' || asset.type === 'swap') continue;
      const name = asset.player_name ?? asset.became_player_name;
      if (!name) continue;
      const cutoff = (asset.type === 'pick' && asset.pick_year)
        ? pickYearToSeason(asset.pick_year)
        : exitTrade.season;
      const d = walkAsset(name, teamId, exitTrade.date, cutoff, depth + 1);
      maxDepth = Math.max(maxDepth, d);
    }

    // 2. The player themselves on their new team (cross-team: follow where they went)
    const newTeams = exitTrade.assets
      .filter(a => (a.player_name === playerName || a.became_player_name === playerName) && a.from_team_id === teamId)
      .map(a => a.to_team_id);
    for (const newTeamId of newTeams) {
      const d = walkAsset(playerName, newTeamId, exitTrade.date, exitTrade.season, depth + 1);
      maxDepth = Math.max(maxDepth, d);
    }

    return maxDepth;
  }

  // Seed with all players/picks in the original trade
  let maxDepth = 0;

  for (const asset of trade.assets) {
    if (asset.type === 'cash' || asset.type === 'swap') continue;
    const name = asset.player_name ?? asset.became_player_name;
    if (!name) continue;
    const cutoff = (asset.type === 'pick' && asset.pick_year)
      ? pickYearToSeason(asset.pick_year)
      : trade.season;
    const d = walkAsset(name, asset.to_team_id, trade.date, cutoff, 1);
    maxDepth = Math.max(maxDepth, d);
  }

  playerScores.sort((a, b) => b.score - a.score);

  return {
    impact: r2(playerScores.reduce((s, p) => s + p.score, 0)),
    playerCount: playerScores.length,
    depth: maxDepth,
    topPlayers: playerScores.slice(0, 5).map(p => ({ name: p.name, score: r2(p.score) })),
  };
}

// ── Build exit trade indexes ─────────────────────────────────────────────────
//
// Player index: Key = "${playerName}|${fromTeamId}"
// Pick index:   Key = "${pickYear}-${pickRound}-${fromTeamId}"
// Both sorted ascending by date.

function buildExitTradeIndexes(allTrades: Trade[]): {
  playerIndex: Map<string, Trade[]>;
  pickIndex: Map<string, Trade[]>;
} {
  const playerIndex = new Map<string, Trade[]>();
  const pickIndex = new Map<string, Trade[]>();

  for (const trade of allTrades) {
    for (const asset of trade.assets) {
      if (asset.type === 'cash' || asset.type === 'swap') continue;

      // Player/pick exit index (existing)
      const name = asset.player_name ?? asset.became_player_name;
      if (name) {
        const key = `${name}|${asset.from_team_id}`;
        if (!playerIndex.has(key)) playerIndex.set(key, []);
        playerIndex.get(key)!.push(trade);
      }

      // Pick exit index (new): tracks when a pick is sent FROM a team
      if (asset.type === 'pick' && asset.pick_year && asset.pick_round && asset.from_team_id) {
        const key = `${asset.pick_year}-${asset.pick_round}-${asset.from_team_id}`;
        if (!pickIndex.has(key)) pickIndex.set(key, []);
        pickIndex.get(key)!.push(trade);
      }
    }
  }

  for (const [, trades] of playerIndex) {
    trades.sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const [, trades] of pickIndex) {
    trades.sort((a, b) => a.date.localeCompare(b.date));
  }

  return { playerIndex, pickIndex };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun     = args.includes('--dry-run');
  const seasonArg  = args.find(a => a.startsWith('--season'));
  const singleSeason = seasonArg
    ? (seasonArg.includes('=') ? seasonArg.split('=')[1] : args[args.indexOf(seasonArg) + 1])
    : null;
  const topArg  = args.find(a => a.startsWith('--top'));
  const topN    = topArg ? parseInt(topArg.includes('=') ? topArg.split('=')[1] : args[args.indexOf(topArg) + 1]) : 0;
  const minBreadthArg = args.find(a => a.startsWith('--min-breadth'));
  const minBreadth = minBreadthArg
    ? parseInt(minBreadthArg.includes('=') ? minBreadthArg.split('=')[1] : args[args.indexOf(minBreadthArg) + 1])
    : 0;
  const leagueArg = args.find(a => a.startsWith('--league'));
  LEAGUE = leagueArg
    ? (leagueArg.includes('=') ? leagueArg.split('=')[1] : args[args.indexOf(leagueArg) + 1])
    : 'NBA';
  const TRADES_DIR = getTradesDir();

  console.log(`Computing ${LEAGUE} chain scores...`);
  console.log('Loading Supabase data...');

  const [playerSeasons, accolades, teamSeasons] = await Promise.all([
    fetchAll<PlayerSeason>('player_seasons', 'player_name,team_id,season,win_shares,playoff_ws'),
    fetchAll<Accolade>('player_accolades', 'player_name,accolade,season'),
    fetchAll<{ team_id: string; season: string; wins: number | null; losses: number | null; championship: boolean }>('team_seasons', 'team_id,season,wins,losses,championship'),
  ]);

  console.log(`  player_seasons:   ${playerSeasons.length} rows`);
  console.log(`  player_accolades: ${accolades.length} rows`);
  console.log(`  team_seasons:     ${teamSeasons.length} rows`);

  const seasonsByPlayerTeam = new Map<string, PlayerSeason[]>();
  for (const row of playerSeasons) {
    const key = `${row.player_name}|${row.team_id}`;
    if (!seasonsByPlayerTeam.has(key)) seasonsByPlayerTeam.set(key, []);
    seasonsByPlayerTeam.get(key)!.push(row);
  }

  const seasonsByPlayer = new Map<string, PlayerSeason[]>();
  for (const row of playerSeasons) {
    if (!seasonsByPlayer.has(row.player_name)) seasonsByPlayer.set(row.player_name, []);
    seasonsByPlayer.get(row.player_name)!.push(row);
  }

  const accoladesByPlayer = new Map<string, Accolade[]>();
  for (const row of accolades) {
    if (!accoladesByPlayer.has(row.player_name)) accoladesByPlayer.set(row.player_name, []);
    accoladesByPlayer.get(row.player_name)!.push(row);
  }

  const championshipSet = new Set<string>(
    teamSeasons.filter(r => r.championship).map(r => `${r.team_id}|${r.season}`)
  );
  console.log(`  Championships:    ${championshipSet.size}`);

  // Build team total playoff WS for championship seasons (for contribution-weighted bonus)
  const teamChampPlayoffWs = new Map<string, number>();
  for (const row of playerSeasons) {
    const champKey = `${row.team_id}|${row.season}`;
    if (championshipSet.has(champKey)) {
      teamChampPlayoffWs.set(champKey, (teamChampPlayoffWs.get(champKey) || 0) + (row.playoff_ws ?? 0));
    }
  }
  console.log(`  Championship team playoff WS totals: ${teamChampPlayoffWs.size} team-seasons`);

  console.log('');

  // Load ALL trades (needed to build exit index) even in single-season mode
  const allSeasonFiles = fs.readdirSync(TRADES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'search-index.json')
    .sort();

  const allTrades: Trade[] = [];
  for (const file of allSeasonFiles) {
    const trades = JSON.parse(fs.readFileSync(path.join(TRADES_DIR, file), 'utf-8')) as Trade[];
    allTrades.push(...trades);
  }
  console.log(`Loaded ${allTrades.length} total trades (all seasons, for exit index).`);

  const { playerIndex: exitTradeIndex, pickIndex: pickExitIndex } = buildExitTradeIndexes(allTrades);
  console.log(`Exit trade index: ${exitTradeIndex.size} player pairs, ${pickExitIndex.size} pick pairs.\n`);

  // Filter to target season(s) for scoring
  const tradesToScore = singleSeason
    ? allTrades.filter(t => t.season === singleSeason)
    : allTrades;
  console.log(`Scoring ${tradesToScore.length} trades${singleSeason ? ` (season: ${singleSeason})` : ''}...`);

  interface ChainResult {
    trade_id: string;
    season: string;
    chain_scores: Record<string, TeamChain>;
    max_chain_score: number;
    max_chain_breadth: number;
    max_chain_depth: number;
    league_impact: number;
    league_impact_players: number;
    league_impact_depth: number;
    league_impact_top: { name: string; score: number }[];
  }

  const results: ChainResult[] = [];
  let processed = 0;

  for (const trade of tradesToScore) {
    const chainScores = scoreTradeChain(
      trade, exitTradeIndex, pickExitIndex,
      seasonsByPlayerTeam, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
    );

    const teams = Object.values(chainScores);
    const maxChainScore   = teams.length ? Math.max(...teams.map(t => t.chain)) : 0;
    const maxChainBreadth = teams.length ? Math.max(...teams.map(t => t.asset_count)) : 0;
    const maxChainDepth   = teams.length ? Math.max(...teams.map(t => t.depth)) : 0;

    const li = computeLeagueImpact(
      trade, exitTradeIndex, pickExitIndex,
      seasonsByPlayer, accoladesByPlayer, championshipSet, teamChampPlayoffWs,
    );

    results.push({
      trade_id: trade.id,
      season: trade.season,
      chain_scores: chainScores,
      max_chain_score: r2(maxChainScore),
      max_chain_breadth: maxChainBreadth,
      max_chain_depth: maxChainDepth,
      league_impact: li.impact,
      league_impact_players: li.playerCount,
      league_impact_depth: li.depth,
      league_impact_top: li.topPlayers,
    });

    processed++;
    if (processed % 200 === 0) process.stdout.write(`  ${processed}/${tradesToScore.length}...\n`);
  }

  console.log(`\nDone computing ${results.length} chain scores.`);

  // ── Summary stats ────────────────────────────────────────────────────────────

  const withChain = results.filter(r => r.max_chain_score > 0).length;
  const deepChains = results.filter(r => r.max_chain_depth >= 3).length;
  const broadChains = results.filter(r => r.max_chain_breadth >= 4).length;
  const withImpact = results.filter(r => r.league_impact > 50).length;
  console.log(`  Has chain value:  ${withChain} (${Math.round(withChain / results.length * 100)}%)`);
  console.log(`  Chain depth ≥ 3:  ${deepChains}`);
  console.log(`  Breadth ≥ 4:      ${broadChains}`);
  console.log(`  League impact>50: ${withImpact}`);

  // ── --top N or --dry-run print ────────────────────────────────────────────────

  const printCount = topN || (dryRun ? 20 : 0);
  if (printCount > 0) {
    let sorted = [...results].sort((a, b) => b.max_chain_score - a.max_chain_score);
    if (minBreadth > 0) sorted = sorted.filter(r => r.max_chain_breadth >= minBreadth);

    console.log(`\nTop ${printCount} by chain score${minBreadth > 0 ? ` (breadth ≥ ${minBreadth})` : ''}:`);
    for (const r of sorted.slice(0, printCount)) {
      const teams = Object.entries(r.chain_scores)
        .sort((a, b) => b[1].chain - a[1].chain)
        .map(([tid, tc]) => {
          const topAsset = [...tc.assets].sort((a, b) => b.chain - a.chain)[0];
          const top = topAsset ? ` (top: ${topAsset.name} ${topAsset.chain.toFixed(1)})` : '';
          return `${tid} chain=${tc.chain.toFixed(1)} direct=${tc.direct.toFixed(1)} d=${tc.depth} n=${tc.asset_count}${top}`;
        });
      console.log(`  [${r.season}] ${r.trade_id.slice(-8)}`);
      for (const t of teams) console.log(`    ${t}`);
      if (r.league_impact > 0) {
        const topNames = r.league_impact_top.map(p => `${p.name} ${p.score.toFixed(1)}`).join(', ');
        console.log(`    LEAGUE IMPACT: ${r.league_impact.toFixed(1)} (${r.league_impact_players} players, depth ${r.league_impact_depth}) top: ${topNames}`);
      }
    }

    // Also show top league impact trades
    const byImpact = [...results].sort((a, b) => b.league_impact - a.league_impact);
    console.log(`\nTop ${printCount} by league impact:`);
    for (const r of byImpact.slice(0, printCount)) {
      const topNames = r.league_impact_top.map(p => `${p.name} ${p.score.toFixed(1)}`).join(', ');
      console.log(`  [${r.season}] ${r.trade_id.slice(-8)}  impact=${r.league_impact.toFixed(1)} players=${r.league_impact_players} depth=${r.league_impact_depth}`);
      console.log(`    top: ${topNames}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — no database writes.');
    return;
  }

  // ── Upsert to trade_chain_scores ─────────────────────────────────────────────

  console.log('\nUpserting to Supabase...');
  const BATCH = 100;  // Smaller batches — chain_scores JSONB can be large
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < results.length; i += BATCH) {
    const batch = results.slice(i, i + BATCH).map(r => ({
      trade_id:              r.trade_id,
      season:                r.season,
      chain_scores:          r.chain_scores,
      max_chain_score:       r.max_chain_score,
      max_chain_breadth:     r.max_chain_breadth,
      max_chain_depth:       r.max_chain_depth,
      league_impact:         r.league_impact,
      league_impact_players: r.league_impact_players,
      league_impact_depth:   r.league_impact_depth,
      league_impact_top:     r.league_impact_top,
      league:                LEAGUE,
    }));

    const { error } = await supabase
      .from('trade_chain_scores')
      .upsert(batch, { onConflict: 'trade_id' });

    if (error) {
      console.error(`Batch error at ${i}: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }
  }

  console.log(`Done! Upserted ${upserted} chain score rows (${errors} batch errors).`);
}

main().catch(console.error);
