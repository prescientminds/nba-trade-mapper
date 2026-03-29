import { create } from 'zustand';
import {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { getSupabase, TradeWithDetails, TransactionAsset, PlayerSeason, PlayerAccolade, TeamSeason, PlayerContract } from './supabase';
import { getAnyTeam, getAnyTeamDisplayInfo } from './teams';
import { layoutGraph, layoutPlayerTimeline, resolveNodeOverlaps } from './graph-layout';
import { searchStaticTrades, staticTradeToTradeWithDetails, loadSeason, loadTrade, loadSearchIndex } from './trade-data';
import { type League, leagueForTeam } from './league';
import type { VisualSkin } from './skins';
import { getDraftInfo } from './draft-data';
import type { StaticTrade } from './supabase';

// ── Supabase data cache ──────────────────────────────────────────────
// Session-level cache for reference data. Keyed by lowercase player name
// or team ID. Fetch once per player/team, filter client-side thereafter.
// Eliminates redundant Supabase calls when multiple functions request
// overlapping subsets of the same player's data.

interface PlayoffGameLogEntry {
  season: string;
  team_id: string;
  game_date: string;
  game_score: number;
  game_margin: number | null;
  pts: number;
  trb: number;
  ast: number;
  opponent_id: string;
  result: string | null;
}

const _playerSeasonsCache = new Map<string, PlayerSeason[]>();
const _playerAccoladesCache = new Map<string, PlayerAccolade[]>();
const _teamSeasonsCache = new Map<string, TeamSeason[]>();
const _playerContractsCache = new Map<string, PlayerContract[]>();
const _playoffGamesCache = new Map<string, PlayoffGameLogEntry[]>();

async function cachedPlayerSeasons(sb: ReturnType<typeof getSupabase>, playerName: string): Promise<PlayerSeason[]> {
  const key = playerName.toLowerCase();
  if (_playerSeasonsCache.has(key)) return _playerSeasonsCache.get(key)!;
  const { data } = await sb
    .from('player_seasons').select('*')
    .ilike('player_name', playerName)
    .order('season', { ascending: true }) as { data: PlayerSeason[] | null };
  const result = data ?? [];
  if (result.length > 0) _playerSeasonsCache.set(key, result);
  return result;
}

async function cachedPlayerAccolades(sb: ReturnType<typeof getSupabase>, playerName: string): Promise<PlayerAccolade[]> {
  const key = playerName.toLowerCase();
  if (_playerAccoladesCache.has(key)) return _playerAccoladesCache.get(key)!;
  const { data } = await sb
    .from('player_accolades').select('*')
    .ilike('player_name', playerName) as { data: PlayerAccolade[] | null };
  const result = data ?? [];
  if (result.length > 0) _playerAccoladesCache.set(key, result);
  return result;
}

async function cachedTeamSeasons(sb: ReturnType<typeof getSupabase>, teamId: string): Promise<TeamSeason[]> {
  if (_teamSeasonsCache.has(teamId)) return _teamSeasonsCache.get(teamId)!;
  const { data } = await sb
    .from('team_seasons').select('*')
    .eq('team_id', teamId) as { data: TeamSeason[] | null };
  const result = data ?? [];
  if (result.length > 0) _teamSeasonsCache.set(teamId, result);
  return result;
}

async function cachedPlayerContracts(sb: ReturnType<typeof getSupabase>, playerName: string): Promise<PlayerContract[]> {
  const key = playerName.toLowerCase();
  if (_playerContractsCache.has(key)) return _playerContractsCache.get(key)!;
  const { data } = await sb
    .from('player_contracts').select('*')
    .ilike('player_name', playerName) as { data: PlayerContract[] | null };
  const result = data ?? [];
  if (result.length > 0) _playerContractsCache.set(key, result);
  return result;
}

async function cachedPlayoffGames(sb: ReturnType<typeof getSupabase>, playerName: string): Promise<PlayoffGameLogEntry[]> {
  const key = playerName.toLowerCase();
  if (_playoffGamesCache.has(key)) return _playoffGamesCache.get(key)!;
  const { data } = await sb
    .from('playoff_game_logs')
    .select('season,team_id,game_date,game_score,game_margin,pts,trb,ast,opponent_id,result')
    .ilike('player_name', playerName)
    .not('game_score', 'is', null)
    .order('game_score', { ascending: false }) as { data: PlayoffGameLogEntry[] | null };
  const result = data ?? [];
  if (result.length > 0) _playoffGamesCache.set(key, result);
  return result;
}

// ── Suffix resolution ────────────────────────────────────────────────
// Trade data uses "Glen Rice Sr." but player_seasons has "Glen Rice".
// Conversely, BBRef scraper sometimes drops "Jr." that Kaggle data keeps.
// Try exact → stripped → with-Jr to cover both directions.
const SUFFIX_RE = /\s+(Sr\.|Jr\.|III|IV|II|V)$/;

/** Name variants for stats lookups: exact, suffix-stripped, and suffix-added ("Jr."). */
function statsNameVariants(name: string): string[] {
  const variants = [name];
  if (SUFFIX_RE.test(name)) {
    variants.push(name.replace(SUFFIX_RE, ''));
  } else {
    // Name has no suffix — also try "Name Jr." (e.g. "Jaren Jackson" → "Jaren Jackson Jr.")
    variants.push(`${name} Jr.`);
  }
  return variants;
}

/** Strip diacritics: "Šarić" → "Saric" */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Fetch player_seasons trying all name variants. When a teamId is provided,
 * prefer the variant whose seasons include that team (handles Jr/Sr mismatches
 * where trade data says "Jaren Jackson" but DB has "Jaren Jackson Jr.").
 * Falls back to fuzzy last-name search when exact variants fail (diacritics).
 */
async function fetchSeasonsWithVariants(
  sb: ReturnType<typeof getSupabase>,
  playerName: string,
  teamId?: string,
): Promise<{ seasons: PlayerSeason[] | null; resolvedName: string }> {
  let fallbackSeasons: PlayerSeason[] | null = null;
  let fallbackName = playerName;

  for (const variant of statsNameVariants(playerName)) {
    const data = await cachedPlayerSeasons(sb, variant);
    if (data.length > 0) {
      if (!teamId || data.some(s => s.team_id === teamId)) {
        return { seasons: data, resolvedName: variant };
      }
      if (!fallbackSeasons) {
        fallbackSeasons = data;
        fallbackName = variant;
      }
    }
  }

  // Diacritics fallback: "Dario Saric" won't ilike-match "Dario Šarić".
  // Try fuzzy search by first + last name parts, then filter client-side.
  if (!fallbackSeasons) {
    const parts = playerName.replace(SUFFIX_RE, '').trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    if (firstName && lastName && firstName !== lastName) {
      // Diacritics fallback can't use the name-keyed cache — uses a pattern query
      const { data } = await sb
        .from('player_seasons')
        .select('*')
        .ilike('player_name', `${firstName}%${lastName}%`)
        .order('season', { ascending: true }) as { data: PlayerSeason[] | null };
      if (data && data.length > 0) {
        // Verify the ASCII-normalized name matches to avoid false positives
        const normalized = stripDiacritics(data[0].player_name).toLowerCase();
        const target = stripDiacritics(playerName).toLowerCase();
        if (normalized === target || normalized.startsWith(target.replace(SUFFIX_RE, '').trim())) {
          const resolved = data[0].player_name;
          // Populate cache under the resolved name for future lookups
          _playerSeasonsCache.set(resolved.toLowerCase(), data);
          if (!teamId || data.some(s => s.team_id === teamId)) {
            return { seasons: data, resolvedName: resolved };
          }
          fallbackSeasons = data;
          fallbackName = resolved;
        }
      }
    }
  }

  return { seasons: fallbackSeasons, resolvedName: fallbackName };
}

// ── Node data types ──────────────────────────────────────────────────
export interface InlinePlayerData {
  playerName: string;
  teamId: string;
  stintIndex: number;
  seasons: string[];
  avgPpg: number | null;
  avgRpg: number | null;
  avgApg: number | null;
  totalWinShares: number | null;
  accolades: string[];
  seasonDetails?: SeasonDetailRow[];
  isLoading?: boolean;
  neverPlayed?: boolean;
}

export interface TradeNodeData {
  trade: TradeWithDetails;
  teamColors: string[];
  teamIds: string[];
  inlinePlayers?: Record<string, InlinePlayerData>;
  [key: string]: unknown;
}

export interface PlayerNodeData {
  name: string;
  teamId: string | null;
  hasJourneyData?: boolean;
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  [key: string]: unknown;
}

export interface PickNodeData {
  asset: TransactionAsset;
  label: string;
  becamePlayer: string | null;
  [key: string]: unknown;
}

export interface PlayoffPeakGame {
  gameScore: number;
  pts: number;
  trb: number;
  ast: number;
  opponentId: string;
  gameDate: string;
  result: string | null;
  gameMargin: number | null;
  gameNumber: number;
  round: number;
}

export interface PlayoffSeriesGame {
  gameNumber: number;
  gameDate: string;
  gameScore: number | null;
  pts: number;
  trb: number;
  ast: number;
  result: string | null;
  gameMargin: number | null;
}

export interface PlayoffSeries {
  opponentId: string;
  round: number;
  games: PlayoffSeriesGame[];
}

export interface SeasonDetailRow {
  season: string;
  gp: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  winShares: number | null;
  teamWins: number | null;
  teamLosses: number | null;
  playoffResult: string | null;
  accolades: string[];
  salary: number | null;
  playoffPeakGames?: PlayoffPeakGame[];
  playoffSeries?: PlayoffSeries[];
}

export interface PlayerStintNodeData {
  playerName: string;
  teamId: string;
  seasons: string[];
  avgPpg: number | null;
  avgRpg: number | null;
  avgApg: number | null;
  totalWinShares: number | null;
  accolades: string[];
  seasonDetails?: SeasonDetailRow[];
  draftYear?: number;
  draftRound?: number;
  draftPick?: number;
  playoffWs?: number | null;
  canExpandBackward?: boolean;
  [key: string]: unknown;
}

export interface GapNodeData {
  playerName: string;
  fromYear: number;
  toYear: number;
  durationYears: number;
  teamId: string;
  [key: string]: unknown;
}

// ── Championship node data ───────────────────────────────────────────
export interface ChampionshipIngredients {
  tradePct: number;
  draftPct: number;
  faPct: number;
}

export interface ChampionshipNodeData {
  teamId: string;
  season: string;
  teamName: string;
  teamColor: string;
  ingredients?: ChampionshipIngredients;
  players: Array<{
    playerName: string;
    avgPpg: number | null;
    avgRpg: number | null;
    avgApg: number | null;
    playoffPpg: number | null;
    playoffRpg: number | null;
    playoffApg: number | null;
    playoffGp: number | null;
    playoffWs: number | null;
    totalWinShares: number | null;
  }>;
  inlinePlayers?: Record<string, InlinePlayerData>;
  [key: string]: unknown;
}

// ── Chain score types (shared with DiscoverySection) ─────────────────
export interface ChainAsset {
  name: string;
  type: string;
  direct: number;
  chain: number;
  exit_trade_id?: string | null;
  fraction?: number;
  children?: ChainAsset[];
}

export type ChainTeamData = {
  direct: number;
  chain: number;
  depth: number;
  asset_count: number;
  max_single_asset: number;
  assets: ChainAsset[];
};

// ── Seed info for shareable links ────────────────────────────────────
export type SeedInfo =
  | { type: 'trade'; tradeId: string }
  | { type: 'chain'; tradeId: string }
  | { type: 'player'; playerName: string }
  | { type: 'championship'; teamId: string; season: string };

// ── Store shape ──────────────────────────────────────────────────────
interface GraphState {
  nodes: Node[];
  edges: Edge[];
  expandedNodes: Set<string>;
  loadingNodes: Set<string>;
  coreNodes: Set<string>;
  layoutMode: 'elk' | 'timeline';
  playerColumns: Map<string, number>;
  playerAnchorTrades: Map<string, string>;
  playerAnchorDirections: Map<string, 'forward' | 'backward' | 'both'>;
  nextColumnIndex: number;
  prevColumnIndex: number;
  pendingFitTarget: string | null;
  expandedGapIds: Set<string>;
  highlightedEdges: Set<string>;
  followHighlightedEdges: Set<string>;
  followPath: { playerName: string; orderedNodeIds: string[]; currentIndex: number } | null;
  selectedLeague: League;
  visualSkin: VisualSkin;
  seedInfo: SeedInfo | null;

  setSelectedLeague: (league: League) => void;
  setVisualSkin: (skin: VisualSkin) => void;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;

  seedFromTrade: (trade: TradeWithDetails) => void;
  /** Like seedFromTrade but skips auto-expand — used by the guided tour */
  seedFromTradeCollapsed: (trade: TradeWithDetails) => void;
  seedFromChain: (tradeId: string, chainScores?: Record<string, ChainTeamData>) => Promise<void>;
  seedFromPlayer: (playerName: string) => Promise<void>;
  expandWeb: (sourceTradeNodeId: string) => Promise<void>;
  collapseWeb: (sourceTradeNodeId: string) => void;
  expandTradeNode: (nodeId: string) => void;
  expandPlayerNode: (nodeId: string) => Promise<void>;
  expandPickNode: (nodeId: string) => void;
  expandPlayerFromTrade: (tradeNodeId: string, asset: TransactionAsset) => Promise<void>;
  expandPlayerHistoryFromTrade: (tradeNodeId: string, asset: TransactionAsset) => Promise<void>;
  expandPlayerFullPathFromTrade: (tradeNodeId: string, asset: TransactionAsset) => Promise<void>;
  expandInlineTradePlayer: (tradeNodeId: string, asset: TransactionAsset) => Promise<void>;
  collapseInlineTradePlayer: (tradeNodeId: string, playerName: string) => Promise<void>;
  expandPlayerJourney: (playerName: string, anchorNodeId?: string) => Promise<void>;
  expandStintDetails: (stintNodeId: string) => Promise<void>;
  assignPlayerColumn: (playerName: string) => number;
  triggerTimelineLayout: () => void;
  toggleGap: (gapNodeId: string) => void;
  removeNode: (nodeId: string) => void;
  clearGraph: () => void;
  collapseAll: () => void;
  expandOneDegree: () => Promise<void>;
  collapseOneDegree: () => void;
  setPendingFitTarget: (nodeId: string) => void;
  clearPendingFitTarget: () => void;
  openTradeFromTransition: (tradeId: string, sourceNodeId?: string) => Promise<void>;
  search: (query: string, league?: League) => Promise<{
    trades: TradeWithDetails[];
    players: string[];
  }>;
  highlightEdgePath: (edgeId: string) => void;
  clearHighlightedEdges: () => void;
  startFollowPath: (playerName: string, fromTradeNodeId: string) => Promise<void>;
  startFollowPathForPlayer: (playerName: string) => Promise<void>;
  advanceFollowPath: () => void;
  retreatFollowPath: () => void;
  exitFollowPath: () => void;
  championshipContext: ChampionshipContext | null;
  seedChampionshipRoster: (teamId: string, season: string) => Promise<void>;
  expandChampionshipPlayer: (playerName: string) => Promise<void>;
  expandAllChampionshipPlayers: () => Promise<void>;
  expandChampionshipPlayerAfter: (playerName: string) => Promise<void>;
  expandChampionshipWeb: () => Promise<void>;
  expandInlineChampionshipPlayer: (nodeId: string, playerName: string) => Promise<void>;
  collapseChampionshipStaged: () => void;
  adjustLayoutForToggle: (nodeId: string, deltaH: number) => void;
}

// Debounce flag for the overlap resolver — prevents multiple checks per frame
let _overlapCheckScheduled = false;

// ── Helpers ──────────────────────────────────────────────────────────
function tradeNodeId(txId: string) {
  return `trade-${txId}`;
}

function playerNodeId(name: string) {
  return `player-${name.toLowerCase().replace(/\s+/g, '-')}`;
}

function pickNodeId(txId: string, assetId: string) {
  return `pick-${txId}-${assetId}`;
}

function stintNodeId(playerName: string, teamId: string, index: number) {
  return `stint-${playerName.toLowerCase().replace(/\s+/g, '-')}-${teamId}-${index}`;
}

function gapNodeId(playerName: string, fromYear: number, toYear: number) {
  return `gap-${playerName.toLowerCase().replace(/\s+/g, '-')}-${fromYear}-${toYear}`;
}

function championshipNodeId(teamId: string, season: string) {
  return `championship-${teamId}-${season}`;
}

function makeChampionshipNode(
  teamId: string,
  season: string,
  teamName: string,
  teamColor: string,
  players: ChampionshipNodeData['players'],
  position = { x: 0, y: 0 },
  ingredients?: ChampionshipIngredients,
): Node {
  return {
    id: championshipNodeId(teamId, season),
    type: 'championship',
    position,
    data: {
      teamId,
      season,
      teamName,
      teamColor,
      players,
      ...(ingredients ? { ingredients } : {}),
    } satisfies ChampionshipNodeData,
  };
}

function makeTradeNode(trade: TradeWithDetails, position = { x: 0, y: 0 }): Node {
  const teamIds = trade.transaction_teams.map((tt) => tt.team_id);
  const teamColors = teamIds.map((id) => getAnyTeam(id)?.color || '#666');
  return {
    id: tradeNodeId(trade.id),
    type: 'trade',
    position,
    data: { trade, teamColors, teamIds } satisfies TradeNodeData,
  };
}

function makePlayerNode(
  name: string,
  teamId: string | null,
  position = { x: 0, y: 0 },
  hasJourneyData = false
): Node {
  return {
    id: playerNodeId(name),
    type: 'player',
    position,
    data: { name, teamId, hasJourneyData } satisfies PlayerNodeData,
  };
}

function makePickNode(
  asset: TransactionAsset,
  position = { x: 0, y: 0 }
): Node {
  const year = asset.pick_year ?? '??';
  const round = asset.pick_round ?? '?';
  const orig = asset.original_team_id ?? asset.from_team_id ?? '??';
  const label = `${year} R${round} Pick (${orig})`;
  return {
    id: pickNodeId(asset.transaction_id, asset.id),
    type: 'pick',
    position,
    data: {
      asset,
      label,
      becamePlayer: asset.became_player_name,
    } satisfies PickNodeData,
  };
}

function makeStintNode(
  playerName: string,
  teamId: string,
  index: number,
  seasons: string[],
  avgPpg: number | null,
  avgRpg: number | null,
  avgApg: number | null,
  totalWinShares: number | null,
  accolades: string[],
  position = { x: 0, y: 0 }
): Node {
  return {
    id: stintNodeId(playerName, teamId, index),
    type: 'playerStint',
    position,
    data: {
      playerName,
      teamId,
      seasons,
      avgPpg,
      avgRpg,
      avgApg,
      totalWinShares,
      accolades,
    } satisfies PlayerStintNodeData,
  };
}

function makeGapNode(
  playerName: string,
  fromYear: number,
  toYear: number,
  teamId: string,
  position = { x: 0, y: 0 }
): Node {
  return {
    id: gapNodeId(playerName, fromYear, toYear),
    type: 'gap',
    position,
    data: {
      playerName,
      fromYear,
      toYear,
      durationYears: toYear - fromYear,
      teamId,
    } satisfies GapNodeData,
  };
}

// Helper: extract player name from a node (shared by highlight/follow methods)
function getPlayerFromNode(nodes: Node[], nodeId: string): string | null {
  const n = nodes.find(nn => nn.id === nodeId);
  if (!n) return null;
  if (n.type === 'playerStint') return (n.data as PlayerStintNodeData).playerName;
  if (n.type === 'player') return (n.data as PlayerNodeData).name;
  if (n.type === 'gap') return (n.data as GapNodeData).playerName;
  return null;
}

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'highlightable',
    animated: false,
    label,
    style: { stroke: '#555', strokeWidth: 1.5 },
  };
}

// Helper: check if an edge already exists between source and target
function edgeExists(edges: Edge[], src: string, tgt: string): boolean {
  return edges.some(e => e.source === src && e.target === tgt);
}

// Helper: find one trade node per connected component (undirected BFS)
function findTradeComponentRoots(nodes: Node[], edges: Edge[]): string[] {
  const tradeNodes = nodes.filter(n => n.type === 'trade');
  if (tradeNodes.length === 0) return [];

  const visited = new Set<string>();
  const roots: string[] = [];
  for (const tn of tradeNodes) {
    if (visited.has(tn.id)) continue;
    roots.push(tn.id);
    const queue = [tn.id];
    visited.add(tn.id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const e of edges) {
        const neighbor = e.source === current ? e.target : (e.target === current ? e.source : null);
        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }
  return roots;
}

// Helper: group consecutive seasons with same team into stints
export interface Stint {
  teamId: string;
  seasons: PlayerSeason[];
}

function groupIntoStints(playerSeasons: PlayerSeason[]): Stint[] {
  if (playerSeasons.length === 0) return [];

  // Sort by season chronologically first
  const sorted = [...playerSeasons].sort((a, b) => a.season.localeCompare(b.season));

  // Re-order same-season entries: continuation of previous team comes first.
  // The old "fewer GP = earlier" heuristic fails when a player is traded FROM
  // the team where they played MORE games (e.g. Harden 2021-22: 44gp BKN → 21gp PHI).
  const reordered: PlayerSeason[] = [];
  let i = 0;
  while (i < sorted.length) {
    const season = sorted[i].season;
    const group: PlayerSeason[] = [];
    while (i < sorted.length && sorted[i].season === season) {
      group.push(sorted[i]);
      i++;
    }

    if (group.length === 1 || reordered.length === 0) {
      // Single entry or first season — sort by GP ascending as fallback
      group.sort((a, b) => (a.gp ?? 999) - (b.gp ?? 999));
      reordered.push(...group);
    } else {
      // Multiple teams in same season — put continuation of previous team first
      const prevTeam = reordered[reordered.length - 1].team_id;
      const continuation = group.filter(g => g.team_id === prevTeam);
      const rest = group.filter(g => g.team_id !== prevTeam);
      reordered.push(...continuation, ...rest);
    }
  }

  // Group consecutive same-team entries into stints
  const stints: Stint[] = [];
  let current: Stint = { teamId: reordered[0].team_id!, seasons: [reordered[0]] };

  for (let j = 1; j < reordered.length; j++) {
    if (reordered[j].team_id === current.teamId) {
      current.seasons.push(reordered[j]);
    } else {
      stints.push(current);
      current = { teamId: reordered[j].team_id!, seasons: [reordered[j]] };
    }
  }
  stints.push(current);

  return stints;
}

function avg(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function sum(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) * 10) / 10;
}

// ── Championship types ──────────────────────────────────────────────
export interface ChampionshipPlayerData {
  playerName: string;
  playoffWs: number | null;
  playoffPpg: number | null;
  playoffRpg: number | null;
  playoffApg: number | null;
  playoffGp: number | null;
  allStints: Stint[];
  championshipStintIndex: number;
  draftInfo: { year: number; round: number; pick: number } | null;
  earliestVisibleStintIndex: number;
}

export interface ChampionshipContext {
  teamId: string;
  season: string;
  players: ChampionshipPlayerData[];
  expandedPaths: Set<string>; // player names whose paths have been seeded
  playerPhases: Map<string, 'road' | 'full'>; // tracks expansion phase per player
}

// ── Find trade between stints ────────────────────────────────────────
async function findTradeBetweenStints(
  playerName: string,
  fromTeamId: string,
  toTeamId: string,
  fromLastSeason: string,
  toFirstSeason: string,
  league?: League,
): Promise<StaticTrade | null> {
  const activeLeague = league ?? leagueForTeam(fromTeamId);
  // Load both seasons — the trade could be in either
  const seasons = new Set([fromLastSeason, toFirstSeason]);
  const allTrades: StaticTrade[] = [];
  for (const season of seasons) {
    const trades = await loadSeason(season, activeLeague);
    allTrades.push(...trades);
  }

  const nameLower = playerName.toLowerCase();

  // Helper: does this trade involve the player (by asset or description)?
  const tradeInvolvesPlayer = (t: StaticTrade): boolean => {
    const hasPlayerInAssets = t.assets.some(
      (a) => a.type === 'player' && a.player_name?.toLowerCase() === nameLower
    );
    if (hasPlayerInAssets) return true;
    return t.description?.toLowerCase().includes(nameLower) ?? false;
  };

  // Primary: find trades where both teams appear in the teams array
  let matches = allTrades.filter((t) => {
    const tradeTeamIds = t.teams.map((tm) => tm.team_id);
    if (!tradeTeamIds.includes(fromTeamId) || !tradeTeamIds.includes(toTeamId)) return false;
    return tradeInvolvesPlayer(t);
  });

  // Fallback for pass-through trades: player was routed through an intermediary
  // team (e.g. Jrue Holiday MIL→POR→BOS via two linked trades days apart).
  // Find the trade that delivered the player to toTeamId by checking asset-level
  // to_team_id, even if fromTeamId isn't in that trade's teams array.
  if (matches.length === 0) {
    matches = allTrades.filter((t) => {
      const tradeTeamIds = t.teams.map((tm) => tm.team_id);
      if (!tradeTeamIds.includes(toTeamId)) return false;
      // Must have a structured asset sending this player TO the destination team
      return t.assets.some(
        (a) => a.type === 'player' && a.player_name?.toLowerCase() === nameLower
          && a.to_team_id === toTeamId
      );
    });
  }

  if (matches.length === 0) return null;

  // Return the best match (prefer the one closest to the transition)
  matches.sort((a, b) => a.date.localeCompare(b.date));
  return matches[matches.length - 1]; // latest matching trade
}

// ── Find all trades involving a name (as player or pick became_player_name) ──
async function findAllTradesForName(name: string, league: League = 'NBA'): Promise<StaticTrade[]> {
  const index = await loadSearchIndex(league);
  const nameLower = name.toLowerCase();

  // Find all index entries where this name appears in the players list
  // (which includes both player_name and became_player_name)
  const matchingEntries = index.filter(entry =>
    entry.players.some(p => p.toLowerCase() === nameLower)
  );

  // Load full trade data for each match
  const seasonGroups = new Map<string, string[]>();
  for (const entry of matchingEntries) {
    if (!seasonGroups.has(entry.season)) seasonGroups.set(entry.season, []);
    seasonGroups.get(entry.season)!.push(entry.id);
  }

  const trades: StaticTrade[] = [];
  for (const [season, ids] of seasonGroups) {
    const seasonTrades = await loadSeason(season, league);
    for (const id of ids) {
      const t = seasonTrades.find(st => st.id === id);
      if (t) {
        // Verify the name actually appears in this trade's assets
        const hasName = t.assets.some(a =>
          (a.player_name?.toLowerCase() === nameLower) ||
          (a.became_player_name?.toLowerCase() === nameLower)
        );
        if (hasName) trades.push(t);
      }
    }
  }

  // Sort by date ascending
  trades.sort((a, b) => a.date.localeCompare(b.date));
  return trades;
}

// ── Find entry trade (how a player arrived at their first team) ──────
async function findEntryTrade(
  playerName: string,
  toTeamId: string,
  firstSeason: string,
  league?: League,
): Promise<StaticTrade | null> {
  const activeLeague = league ?? leagueForTeam(toTeamId);
  // Check the first season and the prior season (trade may have happened in offseason)
  const seasonsToCheck = [firstSeason];
  const startYear = parseInt(firstSeason.split('-')[0]);
  if (startYear > 1976) {
    const prevEndStr = (startYear % 100).toString().padStart(2, '0');
    seasonsToCheck.push(`${startYear - 1}-${prevEndStr}`);
  }

  const allTrades: StaticTrade[] = [];
  for (const season of seasonsToCheck) {
    const trades = await loadSeason(season, activeLeague);
    allTrades.push(...trades);
  }

  const nameLower = playerName.toLowerCase();

  // Find trades where this player appears and the target team is involved.
  // Asset direction in data isn't reliable, so check the teams array.
  const matches = allTrades.filter((t) => {
    const tradeTeamIds = t.teams.map((tm) => tm.team_id);
    if (!tradeTeamIds.includes(toTeamId)) return false;

    // Primary check: player in structured assets
    const hasPlayerInAssets = t.assets.some(
      (a) => a.type === 'player' && a.player_name?.toLowerCase() === nameLower
    );
    if (hasPlayerInAssets) return true;

    // Fallback: player name in trade description
    return t.description?.toLowerCase().includes(nameLower) ?? false;
  });

  if (matches.length === 0) return null;

  // Return earliest matching trade (likely the one that brought them there)
  matches.sort((a, b) => a.date.localeCompare(b.date));
  return matches[0];
}

// ── Find trades after last known stint (for current-season trades) ───
// When player_seasons doesn't have current season data yet, we can still
// detect trades by searching the current season's trade files.
async function findTradesAfterLastStint(
  playerName: string,
  lastTeamId: string,
  lastSeason: string,
  league?: League,
): Promise<{ trade: StaticTrade; toTeamId: string }[]> {
  const activeLeague = league ?? leagueForTeam(lastTeamId);
  const results: { trade: StaticTrade; toTeamId: string }[] = [];
  const nameLower = playerName.toLowerCase();

  // Check the last known season and the next season (current season)
  const startYear = parseInt(lastSeason.split('-')[0]);
  const seasonsToCheck = [lastSeason];
  const nextEndStr = ((startYear + 2) % 100).toString().padStart(2, '0');
  seasonsToCheck.push(`${startYear + 1}-${nextEndStr}`);

  const allTrades: StaticTrade[] = [];
  for (const season of seasonsToCheck) {
    try {
      const trades = await loadSeason(season, activeLeague);
      allTrades.push(...trades);
    } catch {
      // Season file may not exist yet
    }
  }

  // Find trades where this player was moved FROM the last known team
  for (const t of allTrades) {
    const tradeTeamIds = t.teams.map((tm) => tm.team_id);
    if (!tradeTeamIds.includes(lastTeamId)) continue;

    // Check structured assets first
    const playerAsset = t.assets.find(
      (a) => a.type === 'player' && a.player_name?.toLowerCase() === nameLower
    );
    if (playerAsset && playerAsset.from_team_id === lastTeamId && playerAsset.to_team_id) {
      results.push({ trade: t, toTeamId: playerAsset.to_team_id });
      continue;
    }

    // Fallback: check description + determine destination team
    if (t.description?.toLowerCase().includes(nameLower)) {
      const otherTeams = tradeTeamIds.filter(id => id !== lastTeamId);
      if (otherTeams.length === 1) {
        results.push({ trade: t, toTeamId: otherTeams[0] });
      }
    }
  }

  // Sort by date and only return the most recent
  results.sort((a, b) => a.trade.date.localeCompare(b.trade.date));
  return results;
}

// ── Remove orphaned nodes (no edges connecting them to the graph) ────
// Called after expansions to prevent disconnected trade/stint nodes
// from appearing. Core nodes (initial search result) are kept.
function removeOrphanedNodes(
  nodes: Node[],
  edges: Edge[],
  coreNodes: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  // BFS from core nodes to find everything reachable
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    if (!adjacency.has(e.target)) adjacency.set(e.target, []);
    adjacency.get(e.source)!.push(e.target);
    adjacency.get(e.target)!.push(e.source); // undirected reachability
  }

  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const id of coreNodes) {
    if (!reachable.has(id)) {
      reachable.add(id);
      queue.push(id);
    }
  }
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Keep only nodes reachable from core nodes
  const reachableSet = reachable;
  const keptNodes = nodes.filter(n => reachableSet.has(n.id) || coreNodes.has(n.id));
  const keptNodeIds = new Set(keptNodes.map(n => n.id));
  const keptEdges = edges.filter(e => keptNodeIds.has(e.source) && keptNodeIds.has(e.target));
  return { nodes: keptNodes, edges: keptEdges };
}

// ── Store ────────────────────────────────────────────────────────────
export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  expandedNodes: new Set(),
  loadingNodes: new Set(),
  coreNodes: new Set(),
  layoutMode: 'elk',
  playerColumns: new Map(),
  playerAnchorTrades: new Map(),
  playerAnchorDirections: new Map(),
  nextColumnIndex: 1,
  prevColumnIndex: -1,
  pendingFitTarget: null,
  expandedGapIds: new Set(),
  highlightedEdges: new Set(),
  followHighlightedEdges: new Set(),
  followPath: null,
  selectedLeague: 'NBA' as League,
  visualSkin: 'classic' as VisualSkin,
  seedInfo: null,
  championshipContext: null,

  setSelectedLeague: (league: League) => {
    set({ selectedLeague: league });
  },

  setVisualSkin: (skin: VisualSkin) => {
    set({ visualSkin: skin });
  },

  onNodesChange: (changes) => {
    const newNodes = applyNodeChanges(changes, get().nodes);
    set({ nodes: newNodes });

    // When React Flow reports a dimension change (node's actual DOM size changed),
    // schedule an overlap check using measured heights — the "Excel rows" guarantee.
    if (!_overlapCheckScheduled && changes.some(c => c.type === 'dimensions')) {
      _overlapCheckScheduled = true;
      requestAnimationFrame(() => {
        _overlapCheckScheduled = false;
        const current = get().nodes;
        const resolved = resolveNodeOverlaps(current);
        if (resolved) set({ nodes: resolved });
      });
    }
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  removeNode: (nodeId: string) => {
    const state = get();
    const newNodes = state.nodes.filter((n) => n.id !== nodeId);
    const newEdges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    const newExpanded = new Set(state.expandedNodes);
    newExpanded.delete(nodeId);
    const newLoading = new Set(state.loadingNodes);
    newLoading.delete(nodeId);
    const newCore = new Set(state.coreNodes);
    newCore.delete(nodeId);
    set({ nodes: newNodes, edges: newEdges, expandedNodes: newExpanded, loadingNodes: newLoading, coreNodes: newCore });
  },

  adjustLayoutForToggle: (nodeId: string, deltaH: number) => {
    const state = get();
    const sourceNode = state.nodes.find(n => n.id === nodeId);
    if (!sourceNode || deltaH === 0) return;
    const sourceY = sourceNode.position.y;
    const updatedNodes = state.nodes.map(n => {
      if (n.position.y > sourceY && n.id !== nodeId) {
        return { ...n, position: { x: n.position.x, y: n.position.y + deltaH } };
      }
      return n;
    });
    set({ nodes: updatedNodes });
  },

  clearGraph: () => {
    set({
      nodes: [],
      edges: [],
      expandedNodes: new Set(),
      loadingNodes: new Set(),
      coreNodes: new Set(),
      layoutMode: 'elk',
      playerColumns: new Map(),
      playerAnchorTrades: new Map(),
      playerAnchorDirections: new Map(),
      nextColumnIndex: 1,
      prevColumnIndex: -1,
      pendingFitTarget: null,
      expandedGapIds: new Set(),
      highlightedEdges: new Set(),
      followHighlightedEdges: new Set(),
      followPath: null,
      seedInfo: null,
      championshipContext: null,
    });
  },

  setPendingFitTarget: (nodeId: string) => set({ pendingFitTarget: nodeId }),
  clearPendingFitTarget: () => set({ pendingFitTarget: null }),

  highlightEdgePath: (edgeId: string) => {
    const state = get();
    const clickedEdge = state.edges.find(e => e.id === edgeId);
    if (!clickedEdge) return;

    if (state.highlightedEdges.has(edgeId)) {
      set({ highlightedEdges: new Set() });
      return;
    }

    const playerName = getPlayerFromNode(state.nodes, clickedEdge.source) || getPlayerFromNode(state.nodes, clickedEdge.target);
    if (!playerName) {
      set({ highlightedEdges: new Set([edgeId]) });
      return;
    }

    const pathEdges = new Set<string>();
    for (const e of state.edges) {
      if (getPlayerFromNode(state.nodes, e.source) === playerName || getPlayerFromNode(state.nodes, e.target) === playerName) {
        pathEdges.add(e.id);
      }
    }

    set({ highlightedEdges: pathEdges });
  },

  clearHighlightedEdges: () => {
    if (get().highlightedEdges.size > 0) {
      set({ highlightedEdges: new Set() });
    }
  },

  startFollowPath: async (playerName: string, fromTradeNodeId: string) => {
    // Helper: collect edges and build follow path from current graph state
    const buildFollowPath = () => {
      const state = get();
      const isPlayerNode = (nodeId: string): boolean => getPlayerFromNode(state.nodes, nodeId) === playerName;

      const playerEdgeIds = new Set<string>();
      const adjacency = new Map<string, string>();

      for (const e of state.edges) {
        if (isPlayerNode(e.source) || isPlayerNode(e.target)) {
          playerEdgeIds.add(e.id);
          adjacency.set(e.source, e.target);
        }
      }

      if (playerEdgeIds.size === 0) return null;

      // Walk FORWARD from the trade node where Follow was clicked
      const orderedNodeIds: string[] = [];
      let current: string | null = fromTradeNodeId;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        const node = state.nodes.find(n => n.id === current);
        if (node && node.type !== 'gap' && current !== fromTradeNodeId) {
          orderedNodeIds.push(current);
        }
        current = adjacency.get(current) ?? null;
      }

      if (orderedNodeIds.length === 0) return null;
      return { playerEdgeIds, orderedNodeIds };
    };

    // Try with current graph state
    let result = buildFollowPath();

    // If no edges found, load the player's journey first then retry
    if (!result) {
      await get().expandPlayerJourney(playerName, fromTradeNodeId);
      result = buildFollowPath();
    }

    if (!result) return;

    set({
      followHighlightedEdges: result.playerEdgeIds,
      followPath: { playerName, orderedNodeIds: result.orderedNodeIds, currentIndex: 0 },
      pendingFitTarget: result.orderedNodeIds[0],
    });
  },

  // Start follow path from the very beginning of a player's journey on the graph
  // (used by championship cards where there's no specific trade node to start from)
  startFollowPathForPlayer: async (playerName: string) => {
    // Helper: collect edges and build follow path from current graph state
    const buildFollowPath = () => {
      const state = get();
      const isPlayerNode = (nodeId: string): boolean => getPlayerFromNode(state.nodes, nodeId) === playerName;

      const playerEdgeIds = new Set<string>();
      const adjacency = new Map<string, string>();
      const targets = new Set<string>();

      for (const e of state.edges) {
        if (isPlayerNode(e.source) || isPlayerNode(e.target)) {
          playerEdgeIds.add(e.id);
          adjacency.set(e.source, e.target);
          targets.add(e.target);
        }
      }

      if (playerEdgeIds.size === 0) return null;

      // Find root: first player node that is a source but never a target
      let rootNode: string | null = null;
      for (const [source] of adjacency) {
        if (isPlayerNode(source) && !targets.has(source)) {
          rootNode = source;
          break;
        }
      }

      if (!rootNode) return null;

      const orderedNodeIds: string[] = [];
      let current: string | null = rootNode;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        const node = state.nodes.find(n => n.id === current);
        if (node && node.type !== 'gap') {
          orderedNodeIds.push(current);
        }
        current = adjacency.get(current) ?? null;
      }

      if (orderedNodeIds.length === 0) return null;
      return { playerEdgeIds, orderedNodeIds };
    };

    let result = buildFollowPath();

    if (!result) {
      await get().expandPlayerJourney(playerName);
      result = buildFollowPath();
    }

    if (!result) return;

    set({
      followHighlightedEdges: result.playerEdgeIds,
      followPath: { playerName, orderedNodeIds: result.orderedNodeIds, currentIndex: 0 },
      pendingFitTarget: result.orderedNodeIds[0],
    });
  },

  advanceFollowPath: () => {
    const state = get();
    if (!state.followPath) return;

    const { orderedNodeIds, currentIndex } = state.followPath;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= orderedNodeIds.length) {
      // At the end — exit follow mode
      set({ followPath: null, followHighlightedEdges: new Set() });
      return;
    }

    set({
      followPath: { ...state.followPath, currentIndex: nextIndex },
      pendingFitTarget: orderedNodeIds[nextIndex],
    });
  },

  retreatFollowPath: () => {
    const state = get();
    if (!state.followPath) return;

    const { currentIndex } = state.followPath;
    if (currentIndex <= 0) {
      // At the start — nowhere to go, just stay put
      return;
    }

    const prevIndex = currentIndex - 1;
    set({
      followPath: { ...state.followPath, currentIndex: prevIndex },
      pendingFitTarget: state.followPath.orderedNodeIds[prevIndex],
    });
  },

  exitFollowPath: () => {
    const state = get();
    if (state.followPath) {
      set({ followPath: null, followHighlightedEdges: new Set() });
    }
  },

  assignPlayerColumn: (playerName: string) => {
    const state = get();
    if (state.playerColumns.has(playerName)) {
      return state.playerColumns.get(playerName)!;
    }
    const col = state.nextColumnIndex;
    const newMap = new Map(state.playerColumns);
    newMap.set(playerName, col);
    set({ playerColumns: newMap, nextColumnIndex: col + 1 });
    return col;
  },

  triggerTimelineLayout: () => {
    const state = get();
    if (state.layoutMode !== 'timeline') return;
    const laid = layoutPlayerTimeline(state.nodes, state.edges, state.playerColumns, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
    set({ nodes: laid });
  },

  toggleGap: (gapNodeId_: string) => {
    const state = get();
    const newExpandedGaps = new Set(state.expandedGapIds);
    if (newExpandedGaps.has(gapNodeId_)) {
      newExpandedGaps.delete(gapNodeId_);
    } else {
      newExpandedGaps.add(gapNodeId_);
    }
    const laid = layoutPlayerTimeline(state.nodes, state.edges, state.playerColumns, state.expandedNodes, newExpandedGaps, state.playerAnchorTrades, state.playerAnchorDirections, gapNodeId_);
    set({ nodes: laid, expandedGapIds: newExpandedGaps });
  },

  collapseAll: () => {
    const state = get();
    if (state.nodes.length === 0) return;

    // Championship mode: reset to just the championship card (no player paths)
    if (state.championshipContext) {
      const ctx = state.championshipContext;
      const champNodeId_ = championshipNodeId(ctx.teamId, ctx.season);
      const champNode = state.nodes.find(n => n.id === champNodeId_);
      if (!champNode) return;

      // Strip inline players from championship node
      const champData = champNode.data as ChampionshipNodeData;
      const cleanedChampNode = champData.inlinePlayers
        ? { ...champNode, data: { ...champData, inlinePlayers: undefined } }
        : champNode;

      const newExpanded = new Set<string>();
      newExpanded.add(champNodeId_);

      const laid = layoutPlayerTimeline([cleanedChampNode], [], new Map(), newExpanded, state.expandedGapIds, new Map(), new Map(), champNodeId_);
      set({
        nodes: laid,
        edges: [],
        expandedNodes: newExpanded,
        coreNodes: new Set([champNodeId_]),
        playerColumns: new Map(),
        nextColumnIndex: 0,
        prevColumnIndex: -1,
        highlightedEdges: new Set(),
        followHighlightedEdges: new Set(),
        followPath: null,
        championshipContext: {
          ...ctx,
          expandedPaths: new Set<string>(),
          playerPhases: new Map<string, 'road' | 'full'>(),
        },
      });
      return;
    }

    const coreIds = state.coreNodes;
    // Keep only core nodes, strip inline details
    const updatedNodes = state.nodes
      .filter(n => coreIds.size === 0 || coreIds.has(n.id))
      .map(n => {
        if (n.type === 'playerStint' && (n.data as PlayerStintNodeData).seasonDetails) {
          const { seasonDetails: _, ...rest } = n.data as PlayerStintNodeData;
          return { ...n, data: rest };
        }
        if (n.type === 'trade' && (n.data as TradeNodeData).inlinePlayers) {
          const { inlinePlayers: _, ...rest } = n.data as TradeNodeData;
          return { ...n, data: rest };
        }
        if (n.type === 'championship' && (n.data as ChampionshipNodeData).inlinePlayers) {
          const { inlinePlayers: _, ...rest } = n.data as ChampionshipNodeData;
          return { ...n, data: rest };
        }
        return n;
      });
    const keptIds = new Set(updatedNodes.map(n => n.id));
    const updatedEdges = state.edges.filter(e => keptIds.has(e.source) && keptIds.has(e.target));
    const emptyExpanded = new Set<string>();
    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(updatedNodes, updatedEdges, state.playerColumns, emptyExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
      set({ nodes: laid, edges: updatedEdges, expandedNodes: emptyExpanded, highlightedEdges: new Set(), followHighlightedEdges: new Set(), followPath: null });
    } else {
      layoutGraph(updatedNodes, updatedEdges, undefined, emptyExpanded).then((laid) => {
        set({ nodes: laid, edges: updatedEdges, expandedNodes: emptyExpanded, highlightedEdges: new Set(), followHighlightedEdges: new Set(), followPath: null });
      });
    }
  },

  // ── Expand one degree — expand web outward one layer from all trade nodes ──
  expandOneDegree: async () => {
    const state = get();
    const roots = findTradeComponentRoots(state.nodes, state.edges);
    for (const rootId of roots) {
      await get().expandWeb(rootId);
    }
  },

  // ── Collapse one degree — remove outermost layer from all trade webs ──
  collapseOneDegree: () => {
    const state = get();
    const roots = findTradeComponentRoots(state.nodes, state.edges);
    for (const rootId of roots) {
      get().collapseWeb(rootId);
    }
  },

  // ── Open trade from transition node click ───────────────────────
  openTradeFromTransition: async (tradeId: string, sourceNodeId?: string) => {
    const trade = await loadTrade(tradeId, get().selectedLeague);
    if (!trade) return;
    const tradeWithDetails = staticTradeToTradeWithDetails(trade);
    const state = get();
    const nodeId = tradeNodeId(tradeWithDetails.id);

    // If trade node already exists, just expand it
    if (state.nodes.find(n => n.id === nodeId)) {
      if (!state.expandedNodes.has(nodeId)) {
        get().expandTradeNode(nodeId);
      }
      return;
    }

    // Position near the source node that triggered it
    const sourceNode = sourceNodeId ? state.nodes.find(n => n.id === sourceNodeId) : undefined;
    const initialPos = sourceNode
      ? { x: sourceNode.position.x - 160, y: sourceNode.position.y - 60 }
      : { x: 400, y: 100 };

    const node = makeTradeNode(tradeWithDetails, initialPos);
    const allNodes = [...state.nodes, node];

    // Create an edge from trade → source stint so ELK places them adjacent
    const newEdges = sourceNodeId
      ? [...state.edges, makeEdge(nodeId, sourceNodeId)]
      : [...state.edges];

    // Anchor on the source node so the view stays stable
    const laid = await layoutGraph(allNodes, newEdges, sourceNodeId || undefined, state.expandedNodes);
    set({ nodes: laid, edges: newEdges });

    // Auto-expand after a tick
    setTimeout(() => get().expandTradeNode(nodeId), 50);
  },

  // ── Search ───────────────────────────────────────────────────────
  search: async (query: string, league?: League) => {
    if (query.length < 2) return { trades: [], players: [] };

    const activeLeague = league ?? get().selectedLeague;

    // Search static JSON first (covers all historical trades)
    const staticResult = await searchStaticTrades(query, activeLeague);
    const allTrades: TradeWithDetails[] = staticResult.trades.map(staticTradeToTradeWithDetails);
    const uniquePlayers = [...staticResult.players];

    // Also search player_seasons in Supabase for journey data
    const sb = getSupabase();
    const { data: seasonPlayers } = await sb
      .from('player_seasons')
      .select('player_name')
      .eq('league', activeLeague)
      .ilike('player_name', `%${query}%`)
      .limit(50) as { data: { player_name: string }[] | null };

    if (seasonPlayers) {
      for (const sp of seasonPlayers) {
        if (!uniquePlayers.includes(sp.player_name)) {
          uniquePlayers.push(sp.player_name);
        }
      }
    }

    return {
      trades: allTrades.slice(0, 12),
      players: uniquePlayers.slice(0, 8),
    };
  },

  // ── Seed from trade ──────────────────────────────────────────────
  seedFromTrade: (trade: TradeWithDetails) => {
    const node = makeTradeNode(trade, { x: 400, y: 100 });
    set({
      nodes: [node],
      edges: [],
      expandedNodes: new Set(),
      loadingNodes: new Set(),
      coreNodes: new Set([node.id]),
      pendingFitTarget: node.id,
      seedInfo: { type: 'trade', tradeId: trade.id },
    });
    // Auto-expand after a tick
    setTimeout(() => get().expandTradeNode(node.id), 50);
  },

  seedFromTradeCollapsed: (trade: TradeWithDetails) => {
    const node = makeTradeNode(trade, { x: 400, y: 100 });
    set({
      nodes: [node],
      edges: [],
      expandedNodes: new Set(),
      loadingNodes: new Set(),
      coreNodes: new Set([node.id]),
      pendingFitTarget: node.id,
      seedInfo: { type: 'trade', tradeId: trade.id },
    });
  },

  // ── Seed from chain ───────────────────────────────────────────────
  seedFromChain: async (tradeId: string, chainScores?: Record<string, ChainTeamData>) => {
    // 2. Collect valuable players from the FULL recursive asset tree
    interface ValuablePlayer {
      name: string;
      chainScore: number;
      entryTradeId: string;       // trade where this player was received
      exitTradeId: string | null;  // trade where this player was sent away (null = career end)
    }

    let valuablePlayers: ValuablePlayer[] = [];
    let winnerData: ChainTeamData | null = null;
    let winnerTeamId: string | null = null;

    // If we have chain scores, use the recursive asset tree
    if (chainScores && Object.keys(chainScores).length > 0) {
      // 1. Find the winning team (highest chain score)
      const sorted = Object.entries(chainScores).sort(
        (a, b) => b[1].chain - a[1].chain
      );
      if (sorted.length > 0) {
        winnerTeamId = sorted[0][0];
        winnerData = sorted[0][1];
        const threshold = Math.max(winnerData.chain * 0.05, 2);

        function collectValuablePlayers(assets: ChainAsset[], parentEntryTradeId: string): ValuablePlayer[] {
          const results: ValuablePlayer[] = [];
          for (const asset of assets) {
            // Include both traded players AND drafted players (picks that resolved to NBA players)
            const isSignificant = (asset.type === 'player' || asset.type === 'pick') && asset.chain >= threshold;

            if (isSignificant) {
              results.push({
                name: asset.name,
                chainScore: asset.chain,
                entryTradeId: parentEntryTradeId,
                exitTradeId: asset.exit_trade_id ?? null,
              });
            }

            // Recurse into children (assets received when this player/pick was traded away)
            if (asset.children && asset.children.length > 0 && asset.exit_trade_id) {
              const childResults = collectValuablePlayers(asset.children, asset.exit_trade_id);

              // Bridge player: if children qualify but this asset doesn't on its own,
              // include it to maintain edge connectivity from root → deep players
              if (childResults.length > 0 && !isSignificant) {
                results.push({
                  name: asset.name,
                  chainScore: asset.chain,
                  entryTradeId: parentEntryTradeId,
                  exitTradeId: asset.exit_trade_id,
                });
              }

              results.push(...childResults);
            }
          }
          return results;
        }

        const allValuable = collectValuablePlayers(winnerData.assets, tradeId);

        // Separate bridges (below threshold) from primary players (at or above threshold)
        const primaryCandidates: ValuablePlayer[] = [];
        const bridgeCandidates: ValuablePlayer[] = [];
        for (const vp of allValuable) {
          if (vp.chainScore >= threshold) {
            primaryCandidates.push(vp);
          } else {
            bridgeCandidates.push(vp);
          }
        }

        // Deduplicate primary by player name (keep highest chain score entry)
        const bestByName = new Map<string, ValuablePlayer>();
        for (const vp of primaryCandidates) {
          const existing = bestByName.get(vp.name);
          if (!existing || vp.chainScore > existing.chainScore) {
            bestByName.set(vp.name, vp);
          }
        }
        const topPlayers = [...bestByName.values()]
          .sort((a, b) => b.chainScore - a.chainScore);

        // Keep bridges whose names aren't already in top players (avoid duplicates)
        const topNames = new Set(topPlayers.map(p => p.name));
        const neededBridges = bridgeCandidates.filter(b => !topNames.has(b.name));

        valuablePlayers = [...topPlayers, ...neededBridges];
      }
    }

    // Fallback: no chain data or no qualifying players — extract players from trade assets
    if (valuablePlayers.length === 0) {
      const rootTrade = await loadTrade(tradeId, get().selectedLeague);
      if (!rootTrade) return;
      const playerAssets = rootTrade.assets
        .filter(a => a.type === 'player' && a.player_name);
      // Deduplicate by player name (keep first occurrence)
      const seen = new Set<string>();
      const uniquePlayers: typeof playerAssets = [];
      for (const a of playerAssets) {
        const name = a.player_name!;
        if (!seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          uniquePlayers.push(a);
        }
      }
      valuablePlayers = uniquePlayers.slice(0, 5).map(a => ({
        name: a.player_name!,
        chainScore: 0,
        entryTradeId: tradeId,
        exitTradeId: null,
      }));
    }

    // 3. If no qualifying players and we have chain data, fall back to trade-only chain (flat line of trades)
    if (valuablePlayers.length === 0 && winnerData) {
      // Fall back: walk core thread to get trade IDs
      const coreTradeIds: string[] = [tradeId];
      function walkFallback(assets: ChainAsset[]) {
        const candidates = assets.filter(a => a.exit_trade_id).sort((a, b) => b.chain - a.chain);
        if (candidates.length === 0) return;
        const best = candidates[0];
        coreTradeIds.push(best.exit_trade_id!);
        if (best.children?.length) walkFallback(best.children);
      }
      walkFallback(winnerData.assets);

      const league = get().selectedLeague;
      const index = await loadSearchIndex(league);
      const indexMap = new Map(index.map(e => [e.id, e]));
      const fallbackNodes: Node[] = [];
      const fallbackEdges: Edge[] = [];
      for (const tid of coreTradeIds) {
        const entry = indexMap.get(tid);
        if (!entry) continue;
        const seasonTrades = await loadSeason(entry.season, league);
        const st = seasonTrades.find(t => t.id === tid);
        if (!st) continue;
        fallbackNodes.push(makeTradeNode(staticTradeToTradeWithDetails(st), { x: 0, y: 0 }));
      }
      for (let i = 0; i < fallbackNodes.length - 1; i++) {
        fallbackEdges.push(makeEdge(fallbackNodes[i].id, fallbackNodes[i + 1].id));
      }
      if (fallbackNodes.length === 0) return;
      const laid = await layoutGraph(fallbackNodes, fallbackEdges);
      set({
        nodes: laid, edges: fallbackEdges,
        expandedNodes: new Set([fallbackNodes[0].id]),
        loadingNodes: new Set(),
        coreNodes: new Set(laid.map(n => n.id)),
        layoutMode: 'elk',
        playerColumns: new Map(), playerAnchorTrades: new Map(),
        playerAnchorDirections: new Map(),
        nextColumnIndex: 1, prevColumnIndex: -1,
        pendingFitTarget: fallbackNodes[0].id, expandedGapIds: new Set(),
        seedInfo: { type: 'chain', tradeId },
      });
      setTimeout(() => get().expandTradeNode(fallbackNodes[0].id), 50);
      return;
    }

    // 3b. If still no players (e.g. picks-only trade with no chain data), show single trade
    if (valuablePlayers.length === 0) {
      const st = await loadTrade(tradeId, get().selectedLeague);
      if (!st) return;
      const trade = staticTradeToTradeWithDetails(st);
      get().seedFromTrade(trade);
      return;
    }

    // 4. Load root trade from static JSON, create root trade node
    const rootStaticTrade = await loadTrade(tradeId, get().selectedLeague);
    if (!rootStaticTrade) return;
    const rootTrade = staticTradeToTradeWithDetails(rootStaticTrade);
    const rootNode = makeTradeNode(rootTrade, { x: 0, y: 0 });
    const rootNodeId = rootNode.id;

    const allNodes: Node[] = [rootNode];
    const allEdges: Edge[] = [];
    const expandedSet = new Set<string>([rootNodeId]);
    const playerCols = new Map<string, number>();
    const anchorTrades = new Map<string, string>();
    const anchorDirs = new Map<string, 'forward' | 'backward' | 'both'>();

    // 5. For each valuable player, build their stint timeline
    const sb = getSupabase();

    // Collect all unique trade IDs we'll need (entry + exit trades for all players)
    const neededTradeIds = new Set<string>();
    for (const vp of valuablePlayers) {
      neededTradeIds.add(vp.entryTradeId);
      if (vp.exitTradeId) neededTradeIds.add(vp.exitTradeId);
    }

    // Load search index for trade lookups
    const chainLeague = get().selectedLeague;
    const index = await loadSearchIndex(chainLeague);
    const indexMap = new Map(index.map(e => [e.id, e]));

    // Pre-load all needed trades from static JSON
    const staticTradeCache = new Map<string, StaticTrade>();
    for (const tid of neededTradeIds) {
      if (tid === tradeId) {
        staticTradeCache.set(tid, rootStaticTrade);
        continue;
      }
      const entry = indexMap.get(tid);
      if (!entry) continue;
      const seasonTrades = await loadSeason(entry.season, chainLeague);
      const st = seasonTrades.find(t => t.id === tid);
      if (st) staticTradeCache.set(tid, st);
    }

    // Process each player in parallel (using session cache)
    const playerResults = await Promise.all(valuablePlayers.map(async (vp) => {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Fetch seasons + accolades in parallel (cached per player)
      const [allSeasons, allAccolades] = await Promise.all([
        cachedPlayerSeasons(sb, vp.name),
        cachedPlayerAccolades(sb, vp.name),
      ]);

      if (allSeasons.length === 0) {
        // No season data — bridge entry → exit trade directly
        if (vp.exitTradeId && vp.entryTradeId) {
          edges.push(makeEdge(tradeNodeId(vp.entryTradeId), tradeNodeId(vp.exitTradeId)));
        }
        return { nodes, edges, playerName: vp.name };
      }

      // Trade Tree: only show this player's stint on the WINNING TEAM.
      // The chain measures one team's asset management — a player's value on other
      // teams is irrelevant (that's the Sikma/Pippen fix: Pippen's win shares on
      // Chicago shouldn't count toward Seattle's trade tree).
      const chainTeam = winnerTeamId;

      const allStints = groupIntoStints(allSeasons.filter(s => s.team_id));

      // Filter to only stints on the chain team
      const teamStints: { stint: typeof allStints[0]; originalIdx: number }[] = [];
      for (let i = 0; i < allStints.length; i++) {
        if (allStints[i].teamId === chainTeam) {
          teamStints.push({ stint: allStints[i], originalIdx: i });
        }
      }

      // No stint on the winning team — this player was a bridge (traded through
      // without playing). Connect entry trade → exit trade directly to keep the
      // chain connected for downstream players.
      if (teamStints.length === 0) {
        if (vp.exitTradeId && vp.entryTradeId) {
          edges.push(makeEdge(tradeNodeId(vp.entryTradeId), tradeNodeId(vp.exitTradeId)));
        }
        return { nodes, edges, playerName: vp.name };
      }

      const { stint, originalIdx: startIdx } = teamStints[0];
      const stintSeasons = stint.seasons.map(s => s.season);

      // Build accolade map
      const accoladesBySeasonMap = new Map<string, string[]>();
      if (allAccolades) {
        for (const a of allAccolades) {
          if (!a.season || !stintSeasons.includes(a.season)) continue;
          if (!accoladesBySeasonMap.has(a.season)) accoladesBySeasonMap.set(a.season, []);
          accoladesBySeasonMap.get(a.season)!.push(a.accolade);
        }
      }

      const stintAcc: string[] = [];
      for (const s of stintSeasons) {
        const acc = accoladesBySeasonMap.get(s);
        if (acc) stintAcc.push(...acc);
      }

      const sid = stintNodeId(vp.name, stint.teamId, startIdx);
      nodes.push(makeStintNode(
        vp.name, stint.teamId, startIdx, stintSeasons,
        avg(stint.seasons.map(s => s.ppg)),
        avg(stint.seasons.map(s => s.rpg)),
        avg(stint.seasons.map(s => s.apg)),
        sum(stint.seasons.map(s => s.win_shares)),
        [...new Set(stintAcc)],
      ));

      // Edge: entry trade → stint
      const entryTradeNId = tradeNodeId(vp.entryTradeId);
      edges.push(makeEdge(entryTradeNId, sid));

      // Edge: stint → exit trade (if exists)
      if (vp.exitTradeId) {
        const exitTradeNId = tradeNodeId(vp.exitTradeId);
        edges.push(makeEdge(sid, exitTradeNId));
      }

      return { nodes, edges, playerName: vp.name };
    }));

    // 6. Merge all player results, deduplicate trade nodes and edges
    const existingNodeIds = new Set(allNodes.map(n => n.id));
    const existingEdgeIds = new Set(allEdges.map(e => e.id));

    for (let pIdx = 0; pIdx < playerResults.length; pIdx++) {
      const result = playerResults[pIdx];

      // Create any needed trade nodes (entry/exit) that aren't the root
      for (const vp of valuablePlayers) {
        if (vp.name !== result.playerName) continue;

        // Entry trade node (if not root, create it)
        if (vp.entryTradeId !== tradeId) {
          const entryNId = tradeNodeId(vp.entryTradeId);
          if (!existingNodeIds.has(entryNId)) {
            const st = staticTradeCache.get(vp.entryTradeId);
            if (st) {
              allNodes.push(makeTradeNode(staticTradeToTradeWithDetails(st)));
              existingNodeIds.add(entryNId);
            }
          }
        }

        // Exit trade node
        if (vp.exitTradeId) {
          const exitNId = tradeNodeId(vp.exitTradeId);
          if (!existingNodeIds.has(exitNId)) {
            const st = staticTradeCache.get(vp.exitTradeId);
            if (st) {
              allNodes.push(makeTradeNode(staticTradeToTradeWithDetails(st)));
              existingNodeIds.add(exitNId);
            }
          }
        }
      }

      // Add stint and trade nodes (deduplicate)
      for (const node of result.nodes) {
        if (!existingNodeIds.has(node.id)) {
          allNodes.push(node);
          existingNodeIds.add(node.id);
        }
      }

      // Add edges (deduplicate)
      for (const edge of result.edges) {
        if (!existingEdgeIds.has(edge.id)) {
          allEdges.push(edge);
          existingEdgeIds.add(edge.id);
        }
      }

      // Assign column (sorted by chain score → column 1, 2, 3... leaving 0 for anchor trade)
      playerCols.set(result.playerName, pIdx + 1);

      // Set anchor trade (the entry trade) and direction
      const vp = valuablePlayers.find(v => v.name === result.playerName)!;
      anchorTrades.set(result.playerName, tradeNodeId(vp.entryTradeId));
      anchorDirs.set(result.playerName, 'forward');
    }

    if (allNodes.length === 0) return;

    // 7. Remove orphaned nodes, then layout with timeline
    const coreSet = new Set([rootNodeId]);
    const cleaned = removeOrphanedNodes(allNodes, allEdges, coreSet);

    const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, expandedSet, new Set(), anchorTrades, anchorDirs);

    set({
      nodes: laid,
      edges: cleaned.edges,
      expandedNodes: expandedSet,
      loadingNodes: new Set(),
      coreNodes: new Set(laid.map(n => n.id)),
      layoutMode: 'timeline',
      playerColumns: playerCols,
      playerAnchorTrades: anchorTrades,
      playerAnchorDirections: anchorDirs,
      nextColumnIndex: valuablePlayers.length + 1,
      prevColumnIndex: -1,
      pendingFitTarget: rootNodeId,
      expandedGapIds: new Set(),
      seedInfo: { type: 'chain', tradeId },
    });

    // Root trade is already in expandedSet — no toggle needed
  },

  // ── Expand web: one generation per click ────────────────────────
  //
  // Each click extends every player's journey by one leg:
  //   Click 1: source trade → stint → next trade (for each player)
  //   Click 2: next trade → stint → trade after that (continues from where each player left off)
  //   Click N: keeps going until players have no more trades
  //
  // Works by finding the frontier: the latest stint node for each player
  // that has an outgoing trade node but no stint after it yet, OR a stint
  // that has no outgoing edge at all (end of what's visible).
  //
  expandWeb: async (sourceTradeNodeId: string) => {
    const state = get();

    const sourceNode = state.nodes.find(n => n.id === sourceTradeNodeId);
    if (!sourceNode || sourceNode.type !== 'trade') return;
    const sourceData = sourceNode.data as TradeNodeData;
    const sourceTrade = sourceData.trade;

    // BFS forward from source trade to find ALL reachable trade nodes on graph
    const reachableTradeNodeIds: string[] = [sourceTradeNodeId];
    const bfsVisited = new Set<string>([sourceTradeNodeId]);
    const bfsQueue = [sourceTradeNodeId];
    while (bfsQueue.length > 0) {
      const nodeId = bfsQueue.shift()!;
      for (const edge of state.edges) {
        if (edge.source !== nodeId) continue;
        if (bfsVisited.has(edge.target)) continue;
        bfsVisited.add(edge.target);
        const targetNode = state.nodes.find(n => n.id === edge.target);
        if (!targetNode) continue;
        if (targetNode.type === 'trade') reachableTradeNodeIds.push(targetNode.id);
        bfsQueue.push(targetNode.id);
      }
    }

    // Collect unique player names from ALL reachable trade nodes
    const playerNames: string[] = [];
    const seenNames = new Set<string>();
    const playerOriginTrade = new Map<string, { tradeNodeId: string; toTeamId: string | null; fromTeamId: string | null; isPick: boolean }>();
    for (const tradeNId of reachableTradeNodeIds) {
      const tradeNode = state.nodes.find(n => n.id === tradeNId);
      if (!tradeNode) continue;
      const td = tradeNode.data as TradeNodeData;
      for (const a of td.trade.transaction_assets ?? []) {
        const name = a.asset_type === 'player' ? a.player_name : a.became_player_name;
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          playerNames.push(name);
          playerOriginTrade.set(name, {
            tradeNodeId: tradeNId,
            toTeamId: a.to_team_id,
            fromTeamId: a.from_team_id,
            isPick: a.asset_type === 'pick' || a.asset_type === 'swap',
          });
        }
      }
    }
    if (playerNames.length === 0) return;

    const sb = getSupabase();

    // Fetch full career data for all players in parallel (using session cache)
    const playerDataResults = await Promise.all(
      playerNames.map(async (name) => {
        const [seasons, accolades] = await Promise.all([
          cachedPlayerSeasons(sb, name),
          cachedPlayerAccolades(sb, name),
        ]);
        return { name, seasons: seasons.length > 0 ? seasons : null, accolades: accolades.length > 0 ? accolades : null };
      })
    );

    // Build lookup map for reuse in FA fallback
    const playerDataMap = new Map<string, { seasons: PlayerSeason[]; accolades: PlayerAccolade[] | null; stints: Stint[] }>();

    let currentState = get();
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // For each player, figure out where their journey currently ends on
    // the graph and add the next leg
    const nextTradeSearches: { name: string; stintIdx: number; nextStintIdx: number | undefined; fromTeamId: string; toTeamId: string | null; lastSeason: string; firstSeason: string | null }[] = [];

    for (const { name, seasons, accolades } of playerDataResults) {
      if (!seasons || seasons.length === 0) continue;

      const allStints = groupIntoStints(seasons.filter(s => s.team_id));
      if (allStints.length === 0) continue;

      playerDataMap.set(name, { seasons, accolades: accolades ?? null, stints: allStints });

      const playerSlug = name.toLowerCase().replace(/\s+/g, '-');

      // Find the furthest stint already on the graph for this player
      let lastVisibleStintIdx = -1;
      for (let i = allStints.length - 1; i >= 0; i--) {
        const sid = stintNodeId(name, allStints[i].teamId, i);
        if (currentState.nodes.some(n => n.id === sid) || newNodes.some(n => n.id === sid)) {
          lastVisibleStintIdx = i;
          break;
        }
      }

      // Determine what to add next
      let stintToAdd: number; // index into allStints of the stint to create
      let edgeFromId: string; // node ID to draw the edge FROM

      if (lastVisibleStintIdx === -1) {
        // No stints on graph yet — find which trade introduces this player
        const origin = playerOriginTrade.get(name);
        if (!origin || !origin.toTeamId) continue;

        let idx = -1;
        for (let i = 0; i < allStints.length; i++) {
          if (allStints[i].teamId === origin.toTeamId) { idx = i; break; }
        }
        // Fallback: first stint after the from team
        if (idx === -1 && origin.fromTeamId) {
          let fromIdx = -1;
          for (let i = 0; i < allStints.length; i++) {
            if (allStints[i].teamId === origin.fromTeamId) { fromIdx = i; break; }
          }
          if (fromIdx >= 0 && fromIdx + 1 < allStints.length) idx = fromIdx + 1;
        }
        if (idx === -1) {
          // For drafted players from picks, the pick may have been traded
          // before being used to draft. Fall back to first career stint.
          if (origin.isPick) {
            idx = 0;
          } else {
            continue;
          }
        }

        stintToAdd = idx;
        edgeFromId = origin.tradeNodeId;
      } else {
        // There's a visible stint — check if the next hop exists
        // We need: last visible stint → trade → next stint
        // Check if there's already a trade edge going out of the last stint
        const lastSid = stintNodeId(name, allStints[lastVisibleStintIdx].teamId, lastVisibleStintIdx);

        // Is there already an outgoing edge from this stint to a trade or another stint (FA)?
        const hasOutgoing = currentState.edges.some(e =>
          e.source === lastSid && (e.target.startsWith('trade-') || e.target.startsWith('stint-'))
        );

        if (hasOutgoing) {
          // Trade or FA edge exists after this stint. Find the next stint after it.
          if (lastVisibleStintIdx + 1 >= allStints.length) continue; // no more stints

          stintToAdd = lastVisibleStintIdx + 1;

          // Find the outgoing edge (could be trade or direct stint-to-stint for FA)
          const outEdge = currentState.edges.find(e =>
            e.source === lastSid && (e.target.startsWith('trade-') || e.target.startsWith('stint-'))
          );
          edgeFromId = outEdge ? outEdge.target : lastSid;
        } else {
          // No outgoing edge yet — need to find the trade between this stint and the next
          const fromStint = allStints[lastVisibleStintIdx];
          const toStint = lastVisibleStintIdx + 1 < allStints.length ? allStints[lastVisibleStintIdx + 1] : null;

          nextTradeSearches.push({
            name,
            stintIdx: lastVisibleStintIdx,
            nextStintIdx: toStint ? lastVisibleStintIdx + 1 : undefined,
            fromTeamId: fromStint.teamId,
            toTeamId: toStint?.teamId ?? null,
            lastSeason: fromStint.seasons[fromStint.seasons.length - 1].season,
            firstSeason: toStint?.seasons[0].season ?? null,
          });
          continue; // will be handled after trade search
        }
      }

      // Add the stint
      const stint = allStints[stintToAdd];
      const sid = stintNodeId(name, stint.teamId, stintToAdd);
      if (!currentState.nodes.some(n => n.id === sid) && !newNodes.some(n => n.id === sid)) {
        const stintSeasons = stint.seasons.map(s => s.season);
        const stintAccolades: string[] = [];
        if (accolades) {
          for (const a of accolades) {
            if (a.season && stintSeasons.includes(a.season)) stintAccolades.push(a.accolade);
          }
        }
        newNodes.push(makeStintNode(
          name, stint.teamId, stintToAdd, stintSeasons,
          avg(stint.seasons.map(s => s.ppg)),
          avg(stint.seasons.map(s => s.rpg)),
          avg(stint.seasons.map(s => s.apg)),
          sum(stint.seasons.map(s => s.win_shares)),
          [...new Set(stintAccolades)],
        ));
      }

      // Edge from previous node to this stint
      if (!edgeExists(currentState.edges, edgeFromId, sid) && !edgeExists(newEdges, edgeFromId, sid)) {
        newEdges.push(makeEdge(edgeFromId, sid));
      }

      // Queue search for the trade AFTER this stint
      const nextStint = stintToAdd + 1 < allStints.length ? allStints[stintToAdd + 1] : null;
      nextTradeSearches.push({
        name,
        stintIdx: stintToAdd,
        nextStintIdx: nextStint ? stintToAdd + 1 : undefined,
        fromTeamId: stint.teamId,
        toTeamId: nextStint?.teamId ?? null,
        lastSeason: stint.seasons[stint.seasons.length - 1].season,
        firstSeason: nextStint?.seasons[0].season ?? null,
      });
    }

    // Find inter-stint trades
    const nextTradeResults = await Promise.all(
      nextTradeSearches.map(async ({ name, stintIdx, nextStintIdx, fromTeamId, toTeamId, lastSeason, firstSeason }) => {
        let trade: StaticTrade | null = null;
        if (toTeamId && firstSeason) {
          // Normal case: we know both teams
          trade = await findTradeBetweenStints(name, fromTeamId, toTeamId, lastSeason, firstSeason).catch(() => null);
        } else {
          // Last stint case: search all trades for this player after the last season
          const allTrades = await findAllTradesForName(name, get().selectedLeague).catch(() => [] as StaticTrade[]);
          const nameLower = name.toLowerCase();
          // Find the first trade after the last season where the player leaves fromTeamId
          trade = allTrades.find(t => {
            if (t.date < lastSeason) return false; // too early
            const hasFromTeam = t.teams.some(tm => tm.team_id === fromTeamId);
            if (!hasFromTeam) return false;
            // Check the player is being sent FROM this team
            const playerAsset = t.assets.find(a =>
              a.type === 'player' && a.player_name?.toLowerCase() === nameLower
            );
            return playerAsset?.from_team_id === fromTeamId;
          }) ?? null;
        }
        return { name, stintIdx, nextStintIdx, fromTeamId, trade };
      })
    );

    currentState = get();

    for (const { name, stintIdx, nextStintIdx, fromTeamId, trade } of nextTradeResults) {
      if (!trade) {
        // No trade found — free agency: create direct stint → stint edge
        if (nextStintIdx === undefined) continue;
        const pData = playerDataMap.get(name);
        if (!pData) continue;
        const { stints: faStints, accolades: faAccolades } = pData;
        if (nextStintIdx >= faStints.length) continue;

        const nextStint = faStints[nextStintIdx];
        const nextSid = stintNodeId(name, nextStint.teamId, nextStintIdx);
        if (!currentState.nodes.some(n => n.id === nextSid) && !newNodes.some(n => n.id === nextSid)) {
          const stintSeasons = nextStint.seasons.map(s => s.season);
          const stintAccolades: string[] = [];
          if (faAccolades) {
            for (const a of faAccolades) {
              if (a.season && stintSeasons.includes(a.season)) stintAccolades.push(a.accolade);
            }
          }
          newNodes.push(makeStintNode(
            name, nextStint.teamId, nextStintIdx, stintSeasons,
            avg(nextStint.seasons.map(s => s.ppg)),
            avg(nextStint.seasons.map(s => s.rpg)),
            avg(nextStint.seasons.map(s => s.apg)),
            sum(nextStint.seasons.map(s => s.win_shares)),
            [...new Set(stintAccolades)],
          ));
        }

        // Direct stint → stint edge (free agency)
        const fromSid = stintNodeId(name, fromTeamId, stintIdx);
        if (!edgeExists(currentState.edges, fromSid, nextSid) && !edgeExists(newEdges, fromSid, nextSid)) {
          newEdges.push(makeEdge(fromSid, nextSid));
        }
        continue;
      }

      const tradeNId = tradeNodeId(trade.id);
      if (!currentState.nodes.some(n => n.id === tradeNId) && !newNodes.some(n => n.id === tradeNId)) {
        newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
      }

      // Edge: stint → trade
      const sid = stintNodeId(name, fromTeamId, stintIdx);
      if (!edgeExists(currentState.edges, sid, tradeNId) && !edgeExists(newEdges, sid, tradeNId)) {
        newEdges.push(makeEdge(sid, tradeNId));
      }
    }

    if (newNodes.length === 0 && newEdges.length === 0) return;

    // Assign columns for players
    let playerCols = new Map(currentState.playerColumns);
    let nextColIdx = currentState.nextColumnIndex;
    const newAnchorTrades = new Map(currentState.playerAnchorTrades);
    const newAnchorDirections = new Map(currentState.playerAnchorDirections);

    for (const name of playerNames) {
      if (!playerCols.has(name)) {
        playerCols.set(name, nextColIdx);
        nextColIdx++;
      }
      if (!newAnchorTrades.has(name)) {
        const origin = playerOriginTrade.get(name);
        newAnchorTrades.set(name, origin?.tradeNodeId ?? sourceTradeNodeId);
        newAnchorDirections.set(name, 'forward');
      }
    }

    const mergedNodes = [...currentState.nodes, ...newNodes];
    const mergedEdges = [...currentState.edges, ...newEdges];
    const cleaned = removeOrphanedNodes(mergedNodes, mergedEdges, currentState.coreNodes);
    const laid = layoutPlayerTimeline(
      cleaned.nodes, cleaned.edges, playerCols,
      currentState.expandedNodes, currentState.expandedGapIds,
      newAnchorTrades, newAnchorDirections,
      sourceTradeNodeId
    );

    set({
      nodes: laid,
      edges: cleaned.edges,
      playerColumns: playerCols,
      playerAnchorTrades: newAnchorTrades,
      playerAnchorDirections: newAnchorDirections,
      nextColumnIndex: nextColIdx,
      layoutMode: 'timeline',
    });
  },

  // ── Collapse web — remove outermost layer of nodes from a trade ──
  collapseWeb: (sourceTradeNodeId: string) => {
    const state = get();

    // BFS forward from source trade to find all downstream nodes
    const adjacency = new Map<string, string[]>();
    for (const e of state.edges) {
      if (!adjacency.has(e.source)) adjacency.set(e.source, []);
      adjacency.get(e.source)!.push(e.target);
    }

    const descendants = new Set<string>();
    const queue: string[] = [];
    for (const child of adjacency.get(sourceTradeNodeId) ?? []) {
      descendants.add(child);
      queue.push(child);
    }
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of adjacency.get(current) ?? []) {
        if (!descendants.has(child)) {
          descendants.add(child);
          queue.push(child);
        }
      }
    }

    if (descendants.size === 0) return;

    // Find leaf nodes among descendants — nodes with no outgoing edges to other descendants
    const leaves = new Set<string>();
    for (const id of descendants) {
      const children = adjacency.get(id) ?? [];
      const hasDescendantChild = children.some(c => descendants.has(c));
      if (!hasDescendantChild) {
        leaves.add(id);
      }
    }

    if (leaves.size === 0) return;

    // Remove leaf nodes
    const newNodes = state.nodes.filter(n => !leaves.has(n.id));
    const newEdges = state.edges.filter(e => !leaves.has(e.source) && !leaves.has(e.target));
    const newExpanded = new Set(state.expandedNodes);
    for (const id of leaves) newExpanded.delete(id);

    // Clean up orphans
    const cleaned = removeOrphanedNodes(newNodes, newEdges, state.coreNodes);

    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(
        cleaned.nodes, cleaned.edges, state.playerColumns,
        newExpanded, state.expandedGapIds,
        state.playerAnchorTrades, state.playerAnchorDirections,
        sourceTradeNodeId,
      );
      set({ nodes: laid, edges: cleaned.edges, expandedNodes: newExpanded });
    } else {
      set({ nodes: cleaned.nodes, edges: cleaned.edges, expandedNodes: newExpanded });
    }
  },

  // ── Seed from player ─────────────────────────────────────────────
  seedFromPlayer: async (playerName: string) => {
    const sb = getSupabase();

    // Check if we have journey data (player_seasons) — try suffix variants
    let seasonCheck: { player_name: string }[] | null = null;
    for (const variant of statsNameVariants(playerName)) {
      const { data } = await sb
        .from('player_seasons')
        .select('player_name')
        .ilike('player_name', variant)
        .limit(1) as { data: { player_name: string }[] | null };
      if (data && data.length > 0) { seasonCheck = data; break; }
    }

    if (seasonCheck && seasonCheck.length > 0) {
      // Use journey view: create player node and immediately expand journey
      const node = makePlayerNode(playerName, null, { x: 400, y: 100 }, true);
      set({
        nodes: [node],
        edges: [],
        expandedNodes: new Set(),
        loadingNodes: new Set(),
        coreNodes: new Set([node.id]),
        seedInfo: { type: 'player', playerName },
      });
      // Expand journey after a tick
      setTimeout(() => get().expandPlayerJourney(playerName, node.id), 50);
      return;
    }

    // Fallback: find trades involving this player from static JSON
    const staticResult = await searchStaticTrades(playerName);
    const staticTrades = staticResult.trades
      .filter((t) => t.assets.some(
        (a) => a.player_name?.toLowerCase() === playerName.toLowerCase()
      ))
      .map(staticTradeToTradeWithDetails);

    if (staticTrades.length === 0) {
      const node = makePlayerNode(playerName, null, { x: 400, y: 300 });
      set({ nodes: [node], edges: [], expandedNodes: new Set(), loadingNodes: new Set(), coreNodes: new Set([node.id]), seedInfo: { type: 'player', playerName } });
      return;
    }

    const firstAsset = staticTrades[0].transaction_assets.find(
      (a) => a.player_name?.toLowerCase() === playerName.toLowerCase()
    );
    const teamId = firstAsset?.to_team_id || null;

    const playerNode = makePlayerNode(playerName, teamId, { x: 400, y: 100 });
    const newNodes: Node[] = [playerNode];
    const newEdges: Edge[] = [];

    for (const trade of staticTrades.slice(0, 5)) {
      const tNode = makeTradeNode(trade);
      newNodes.push(tNode);
      newEdges.push(makeEdge(playerNode.id, tNode.id));
    }

    const newExpanded = new Set([playerNode.id]);
    const newCore = new Set(newNodes.map(n => n.id));
    const laid = await layoutGraph(newNodes, newEdges, undefined, newExpanded);
    set({
      nodes: laid,
      edges: newEdges,
      expandedNodes: newExpanded,
      loadingNodes: new Set(),
      coreNodes: newCore,
      seedInfo: { type: 'player', playerName },
    });
  },

  // ── Expand player journey ─────────────────────────────────────────
  // Output: PlayerNode → TradeNode → TradeNode → ...
  // No separate stint nodes — stint info is accessible inline within each trade card.
  expandPlayerJourney: async (playerName: string, anchorNodeId?: string) => {
    const sb = getSupabase();

    // Fetch all seasons — try exact name first, then stripped suffix (Sr./Jr./III/IV)
    let seasons: PlayerSeason[] | null = null;
    for (const variant of statsNameVariants(playerName)) {
      const { data } = await sb
        .from('player_seasons')
        .select('*')
        .ilike('player_name', variant)
        .order('season', { ascending: true }) as { data: PlayerSeason[] | null };
      if (data && data.length > 0) {
        seasons = data;
        break;
      }
    }

    if (!seasons || seasons.length === 0) return;

    const stints = groupIntoStints(seasons.filter(s => s.team_id));
    if (stints.length === 0) return;

    const state = get();
    const pid = playerNodeId(playerName);
    if (!state.nodes.find(n => n.id === pid)) return;

    const firstStint = stints[0];
    const firstSeason = firstStint.seasons[0].season;

    // Fetch draft info, entry trade, and all inter-stint trades in parallel
    const interStintPromises: Promise<StaticTrade | null>[] = [];
    for (let i = 0; i < stints.length - 1; i++) {
      const fromStint = stints[i];
      const toStint = stints[i + 1];
      const fromLastSeason = fromStint.seasons[fromStint.seasons.length - 1].season;
      const toFirstSeason = toStint.seasons[0].season;
      interStintPromises.push(
        findTradeBetweenStints(playerName, fromStint.teamId, toStint.teamId, fromLastSeason, toFirstSeason)
          .catch(() => null)
      );
    }

    const [draftInfo, entryTrade, ...tradeResults] = await Promise.all([
      getDraftInfo(playerName).catch(() => null),
      findEntryTrade(playerName, firstStint.teamId, firstSeason).catch(() => null),
      ...interStintPromises,
    ]);

    // Trades after last known stint (current-season moves)
    const lastStint = stints[stints.length - 1];
    const lastSeason = lastStint.seasons[lastStint.seasons.length - 1].season;
    const recentTrades = await findTradesAfterLastStint(playerName, lastStint.teamId, lastSeason);

    const currentState = get();
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Build ordered list of all trades in player's career, tracking the team after each trade
    const orderedTradesWithTeam: Array<{ trade: StaticTrade; teamAfter: string }> = [];

    // Entry trade (only if player wasn't drafted to their first team)
    if (!draftInfo && entryTrade) {
      orderedTradesWithTeam.push({ trade: entryTrade, teamAfter: stints[0].teamId });
    }

    // Inter-stint trades
    for (let i = 0; i < stints.length - 1; i++) {
      const trade = tradeResults[i] as StaticTrade | null;
      if (trade) orderedTradesWithTeam.push({ trade, teamAfter: stints[i + 1].teamId });
    }

    // Recent trades after last known stint
    for (const { trade, toTeamId } of recentTrades) {
      orderedTradesWithTeam.push({ trade, teamAfter: toTeamId });
    }

    const orderedTrades = orderedTradesWithTeam.map(t => t.trade);

    // Create ALL stint nodes (index 0 through stints.length-1)
    for (let i = 0; i < stints.length; i++) {
      const stint = stints[i];
      const sid = stintNodeId(playerName, stint.teamId, i);
      if (currentState.nodes.find(n => n.id === sid) || newNodes.find(n => n.id === sid)) continue;
      const stintSeasons = stint.seasons.map(s => s.season);
      let stintNodeRaw = makeStintNode(
        playerName, stint.teamId, i, stintSeasons,
        avg(stint.seasons.map(s => s.ppg)),
        avg(stint.seasons.map(s => s.rpg)),
        avg(stint.seasons.map(s => s.apg)),
        sum(stint.seasons.map(s => s.win_shares)),
        [],  // accolades loaded lazily on stint expand
      );
      if (i === 0 && draftInfo) {
        stintNodeRaw = { ...stintNodeRaw, data: { ...stintNodeRaw.data,
          draftYear: draftInfo.year, draftRound: draftInfo.round, draftPick: draftInfo.pick } };
      }
      newNodes.push(stintNodeRaw);
    }

    // Create TradeNodes
    for (const trade of orderedTrades) {
      const tId = tradeNodeId(trade.id);
      if (!currentState.nodes.find(n => n.id === tId) && !newNodes.find(n => n.id === tId)) {
        newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
      }
    }

    // Create edges: PlayerNode → [EntryTrade →] Stint[0] → Trade[0] → Stint[1] → Trade[1] → ... → Stint[N] → RecentTrades
    const firstStintId = stintNodeId(playerName, stints[0].teamId, 0);

    // 1. PlayerNode → (optional EntryTrade →) Stint[0]
    if (entryTrade && !draftInfo) {
      const etId = tradeNodeId(entryTrade.id);
      if (!edgeExists(newEdges, pid, etId) && !edgeExists(currentState.edges, pid, etId))
        newEdges.push(makeEdge(pid, etId));
      if (!edgeExists(newEdges, etId, firstStintId) && !edgeExists(currentState.edges, etId, firstStintId))
        newEdges.push(makeEdge(etId, firstStintId));
    } else {
      if (!edgeExists(newEdges, pid, firstStintId) && !edgeExists(currentState.edges, pid, firstStintId))
        newEdges.push(makeEdge(pid, firstStintId));
    }

    // 2. Stint[i] → Trade[i] → Stint[i+1] (or direct Stint[i] → Stint[i+1] if no trade found)
    for (let i = 0; i < stints.length - 1; i++) {
      const trade = tradeResults[i] as StaticTrade | null;
      const sid = stintNodeId(playerName, stints[i].teamId, i);
      const sidNext = stintNodeId(playerName, stints[i + 1].teamId, i + 1);
      if (trade) {
        const tId = tradeNodeId(trade.id);
        if (!edgeExists(newEdges, sid, tId) && !edgeExists(currentState.edges, sid, tId))
          newEdges.push(makeEdge(sid, tId));
        if (!edgeExists(newEdges, tId, sidNext) && !edgeExists(currentState.edges, tId, sidNext))
          newEdges.push(makeEdge(tId, sidNext));
      } else {
        if (!edgeExists(newEdges, sid, sidNext) && !edgeExists(currentState.edges, sid, sidNext))
          newEdges.push(makeEdge(sid, sidNext));
      }
    }

    // 3. Stint[N] → RecentTrade[0] → RecentTrade[1] → ...
    {
      const lastSid = stintNodeId(playerName, stints[stints.length - 1].teamId, stints.length - 1);
      let prevId = lastSid;
      for (const { trade: rt } of recentTrades) {
        const rtId = tradeNodeId(rt.id);
        if (!edgeExists(newEdges, prevId, rtId) && !edgeExists(currentState.edges, prevId, rtId))
          newEdges.push(makeEdge(prevId, rtId));
        prevId = rtId;
      }
    }

    // Inject gap nodes for large time spans (> 2 years between stint end and next trade)
    const GAP_THRESHOLD_YEARS = 2;

    // Gap: between Stint[i] last season and inter-stint trade[i]
    for (let i = 0; i < stints.length - 1; i++) {
      const trade = tradeResults[i] as StaticTrade | null;
      if (!trade) continue;
      const stint = stints[i];
      const stintLastYear = parseInt(stint.seasons[stint.seasons.length - 1].season.split('-')[0]);
      const tradeYear = parseInt(trade.date.slice(0, 4));
      const delta = tradeYear - stintLastYear;
      if (!isNaN(stintLastYear) && !isNaN(tradeYear) && delta > GAP_THRESHOLD_YEARS) {
        const sid = stintNodeId(playerName, stint.teamId, i);
        const tId = tradeNodeId(trade.id);
        const gId = gapNodeId(playerName, stintLastYear, tradeYear);
        if (!currentState.nodes.find(n => n.id === gId) && !newNodes.find(n => n.id === gId))
          newNodes.push(makeGapNode(playerName, stintLastYear, tradeYear, stint.teamId));
        // Replace Stint[i] → Trade[i] with Stint[i] → Gap → Trade[i]
        const idxDirect = newEdges.findIndex(e => e.source === sid && e.target === tId);
        if (idxDirect !== -1) {
          newEdges.splice(idxDirect, 1);
          if (!edgeExists(newEdges, sid, gId) && !edgeExists(currentState.edges, sid, gId))
            newEdges.push(makeEdge(sid, gId));
          if (!edgeExists(newEdges, gId, tId) && !edgeExists(currentState.edges, gId, tId))
            newEdges.push(makeEdge(gId, tId));
        }
      }
    }

    // Gap: between consecutive recent trades (rare)
    for (let i = 0; i < recentTrades.length - 1; i++) {
      const t1Year = parseInt(recentTrades[i].trade.date.slice(0, 4));
      const t2Year = parseInt(recentTrades[i + 1].trade.date.slice(0, 4));
      const delta = t2Year - t1Year;
      if (!isNaN(t1Year) && !isNaN(t2Year) && delta > GAP_THRESHOLD_YEARS) {
        const teamDuring = recentTrades[i].toTeamId;
        const srcId = tradeNodeId(recentTrades[i].trade.id);
        const tgtId = tradeNodeId(recentTrades[i + 1].trade.id);
        const gId = gapNodeId(playerName, t1Year, t2Year);
        if (!currentState.nodes.find(n => n.id === gId) && !newNodes.find(n => n.id === gId))
          newNodes.push(makeGapNode(playerName, t1Year, t2Year, teamDuring));
        const idxDirect = newEdges.findIndex(e => e.source === srcId && e.target === tgtId);
        if (idxDirect !== -1) {
          newEdges.splice(idxDirect, 1);
          if (!edgeExists(newEdges, srcId, gId) && !edgeExists(currentState.edges, srcId, gId))
            newEdges.push(makeEdge(srcId, gId));
          if (!edgeExists(newEdges, gId, tgtId) && !edgeExists(currentState.edges, gId, tgtId))
            newEdges.push(makeEdge(gId, tgtId));
        }
      }
    }

    if (newNodes.length === 0 && newEdges.length === 0) return;

    // Update player node with draft info
    let allNodes = [...currentState.nodes, ...newNodes];
    if (draftInfo) {
      allNodes = allNodes.map(n => {
        if (n.id !== pid) return n;
        return {
          ...n,
          data: {
            ...n.data,
            draftYear: draftInfo.year,
            draftRound: draftInfo.round,
            draftPick: draftInfo.pick,
          },
        };
      });
    }

    // Remove stale Trade→Trade bypass edges left by old code (now mediated by intermediate stints)
    const staleBypasses = new Set<string>();
    // Old entry trade edge: firstStintId → entryTrade (direction is reversed in new code)
    if (entryTrade && !draftInfo) {
      staleBypasses.add(`e-${firstStintId}-${tradeNodeId(entryTrade.id)}`);
      const firstInterTrade = tradeResults[0] as StaticTrade | null;
      if (firstInterTrade)
        staleBypasses.add(`e-${tradeNodeId(entryTrade.id)}-${tradeNodeId(firstInterTrade.id)}`);
    }
    // Old consecutive inter-stint trade chains (now mediated by intermediate stints)
    for (let i = 0; i < tradeResults.length - 1; i++) {
      const t1 = tradeResults[i] as StaticTrade | null;
      const t2 = tradeResults[i + 1] as StaticTrade | null;
      if (t1 && t2) staleBypasses.add(`e-${tradeNodeId(t1.id)}-${tradeNodeId(t2.id)}`);
    }
    // Old last inter-stint trade → first recent trade (now mediated by lastStint)
    if (recentTrades.length > 0) {
      const lastInterTrade = ([...tradeResults] as (StaticTrade | null)[]).reverse().find(t => t != null);
      if (lastInterTrade)
        staleBypasses.add(`e-${tradeNodeId(lastInterTrade.id)}-${tradeNodeId(recentTrades[0].trade.id)}`);
      else if (entryTrade && !draftInfo)
        staleBypasses.add(`e-${tradeNodeId(entryTrade.id)}-${tradeNodeId(recentTrades[0].trade.id)}`);
    }
    const filteredExistingEdges = currentState.edges.filter(e => !staleBypasses.has(e.id));
    const allEdges = [...filteredExistingEdges, ...newEdges];
    const newExpanded = new Set(currentState.expandedNodes);
    newExpanded.add(pid);
    const newCore = new Set(currentState.coreNodes);
    for (const n of newNodes) newCore.add(n.id);
    newCore.add(pid);

    // Timeline mode: assign primary player to next available column
    let playerCols = currentState.playerColumns;
    let nextColIdx = currentState.nextColumnIndex;
    if (!playerCols.has(playerName)) {
      playerCols = new Map(playerCols);
      playerCols.set(playerName, nextColIdx);
      nextColIdx++;
    }

    // Remove orphaned nodes before layout
    const cleaned = removeOrphanedNodes(allNodes, allEdges, newCore);

    const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, newExpanded, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections);

    const firstFocusTarget = orderedTrades.length > 0
      ? tradeNodeId(orderedTrades[0].id)
      : pid;

    set({
      nodes: laid,
      edges: cleaned.edges,
      expandedNodes: newExpanded,
      loadingNodes: new Set([...currentState.loadingNodes].filter(id => id !== pid)),
      coreNodes: newCore,
      layoutMode: 'timeline',
      playerColumns: playerCols,
      nextColumnIndex: nextColIdx,
      pendingFitTarget: firstFocusTarget,
    });
  },

  // ── Expand stint details (toggle inline) ─────────────────────────
  expandStintDetails: async (stintNodeId_: string) => {
    const state = get();

    // Toggle OFF: if already expanded, collapse by clearing seasonDetails
    if (state.expandedNodes.has(stintNodeId_)) {
      const newExpanded = new Set(state.expandedNodes);
      newExpanded.delete(stintNodeId_);
      const updatedNodes = state.nodes.map(n => {
        if (n.id !== stintNodeId_) return n;
        const { seasonDetails: _, ...rest } = n.data as PlayerStintNodeData;
        return { ...n, data: rest };
      });
      if (state.layoutMode === 'timeline') {
        const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, stintNodeId_);
        set({ nodes: laid, expandedNodes: newExpanded });
      } else {
        const laid = await layoutGraph(updatedNodes, state.edges, stintNodeId_, newExpanded);
        set({ nodes: laid, expandedNodes: newExpanded });
      }
      return;
    }

    if (state.loadingNodes.has(stintNodeId_)) return;
    set({ loadingNodes: new Set([...state.loadingNodes, stintNodeId_]) });

    const stintNode = state.nodes.find(n => n.id === stintNodeId_);
    if (!stintNode || stintNode.type !== 'playerStint') {
      set({ loadingNodes: new Set([...get().loadingNodes].filter(id => id !== stintNodeId_)) });
      return;
    }

    const { playerName, teamId, seasons } = stintNode.data as PlayerStintNodeData;
    const sb = getSupabase();
    const seasonsSet = new Set(seasons);

    // Fetch all 5 data sources in parallel using session cache, then filter client-side
    const [allPlayerSeasons, allTeamSeasons, allAccolades, allContracts, allPlayoffGames] = await Promise.all([
      cachedPlayerSeasons(sb, playerName),
      cachedTeamSeasons(sb, teamId),
      cachedPlayerAccolades(sb, playerName),
      cachedPlayerContracts(sb, playerName),
      cachedPlayoffGames(sb, playerName),
    ]);

    // Filter to this stint's team + seasons
    const seasonStats = allPlayerSeasons.filter(s => s.team_id === teamId && seasonsSet.has(s.season));
    const teamSeasons = allTeamSeasons.filter(ts => seasonsSet.has(ts.season));

    const teamSeasonMap = new Map<string, TeamSeason>();
    for (const ts of teamSeasons) teamSeasonMap.set(ts.season, ts);

    const accolades = allAccolades.filter(a => a.season && seasonsSet.has(a.season));

    const accoladesByS = new Map<string, string[]>();
    for (const a of accolades) {
      if (!a.season) continue;
      if (!accoladesByS.has(a.season)) accoladesByS.set(a.season, []);
      accoladesByS.get(a.season)!.push(a.accolade);
    }

    const contracts = allContracts.filter(c => c.team_id === teamId && seasonsSet.has(c.season));

    const contractMap = new Map<string, PlayerContract>();
    for (const c of contracts) contractMap.set(c.season, c);

    // Filter playoff game logs for this team + seasons
    const playoffGames = allPlayoffGames
      .filter(g => g.team_id === teamId && seasonsSet.has(g.season))
      .sort((a, b) => b.game_score - a.game_score);

    // Compute game numbers within each series and build series data
    const peakGamesBySeason = new Map<string, PlayoffPeakGame[]>();
    const seriesBySeason = new Map<string, PlayoffSeries[]>();
    if (playoffGames) {
      // Sort chronologically to assign game numbers
      const chronological = [...playoffGames].sort((a, b) =>
        a.game_date.localeCompare(b.game_date)
      );

      // Group by season+opponent, assign game numbers
      const seriesMap = new Map<string, { opponentId: string; games: PlayoffSeriesGame[] }>();
      for (const g of chronological) {
        const key = `${g.season}|${g.opponent_id}`;
        if (!seriesMap.has(key)) {
          seriesMap.set(key, { opponentId: g.opponent_id, games: [] });
        }
        const series = seriesMap.get(key)!;
        series.games.push({
          gameNumber: series.games.length + 1,
          gameDate: g.game_date,
          gameScore: g.game_score,
          pts: g.pts,
          trb: g.trb,
          ast: g.ast,
          result: g.result,
          gameMargin: g.game_margin,
        });
      }

      // Assign round numbers: group series by season, sort by first game date
      const seriesBySeasonRaw = new Map<string, { key: string; opponentId: string; firstDate: string; games: PlayoffSeriesGame[] }[]>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const arr = seriesBySeasonRaw.get(season) || [];
        arr.push({ key, opponentId: series.opponentId, firstDate: series.games[0]?.gameDate ?? '', games: series.games });
        seriesBySeasonRaw.set(season, arr);
      }

      // Sort each season's series chronologically → round 1, 2, 3, 4
      const roundLookup = new Map<string, number>(); // "season|opponent_id" → round
      for (const [season, seriesList] of seriesBySeasonRaw) {
        seriesList.sort((a, b) => a.firstDate.localeCompare(b.firstDate));
        const builtSeries: PlayoffSeries[] = [];
        seriesList.forEach((s, i) => {
          const round = i + 1;
          roundLookup.set(`${season}|${s.opponentId}`, round);
          builtSeries.push({ opponentId: s.opponentId, round, games: s.games });
        });
        seriesBySeason.set(season, builtSeries);
      }

      // Build game number + round lookup: "game_date|opponent_id" → { gameNumber, round }
      const gameLookup = new Map<string, { gameNumber: number; round: number }>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const round = roundLookup.get(`${season}|${series.opponentId}`) ?? 1;
        for (const g of series.games) {
          gameLookup.set(`${g.gameDate}|${series.opponentId}`, { gameNumber: g.gameNumber, round });
        }
      }

      // Peak games: GS >= 20, top 1 per season (playoffGames already sorted by game_score DESC)
      for (const g of playoffGames) {
        if (g.game_score < 20) continue;
        const arr = peakGamesBySeason.get(g.season) || [];
        if (arr.length < 1) {
          const info = gameLookup.get(`${g.game_date}|${g.opponent_id}`);
          arr.push({
            gameScore: g.game_score,
            pts: g.pts,
            trb: g.trb,
            ast: g.ast,
            opponentId: g.opponent_id,
            gameDate: g.game_date,
            result: g.result,
            gameMargin: g.game_margin,
            gameNumber: info?.gameNumber ?? 0,
            round: info?.round ?? 1,
          });
          peakGamesBySeason.set(g.season, arr);
        }
      }
    }

    // Build SeasonDetailRow[] and inject into the stint node's data
    const seasonDetails: SeasonDetailRow[] = [];
    if (seasonStats) {
      for (const ss of seasonStats) {
        const ts = teamSeasonMap.get(ss.season) || null;
        seasonDetails.push({
          season: ss.season,
          gp: ss.gp,
          ppg: ss.ppg,
          rpg: ss.rpg,
          apg: ss.apg,
          winShares: ss.win_shares,
          teamWins: ts?.wins ?? null,
          teamLosses: ts?.losses ?? null,
          playoffResult: ts?.playoff_result ?? null,
          accolades: accoladesByS.get(ss.season) || [],
          salary: contractMap.get(ss.season)?.salary ?? null,
          playoffPeakGames: peakGamesBySeason.get(ss.season),
          playoffSeries: seriesBySeason.get(ss.season),
        });
      }
    }

    const currentState = get();
    const updatedNodes = currentState.nodes.map(n => {
      if (n.id !== stintNodeId_) return n;
      return { ...n, data: { ...n.data, seasonDetails } };
    });

    const newExpanded = new Set(currentState.expandedNodes);
    newExpanded.add(stintNodeId_);
    const newLoading = new Set([...currentState.loadingNodes].filter(id => id !== stintNodeId_));

    if (currentState.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(updatedNodes, currentState.edges, currentState.playerColumns, newExpanded, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections, stintNodeId_);
      set({ nodes: laid, expandedNodes: newExpanded, loadingNodes: newLoading });
    } else {
      const laid = await layoutGraph(updatedNodes, currentState.edges, stintNodeId_, newExpanded);
      set({ nodes: laid, expandedNodes: newExpanded, loadingNodes: newLoading });
    }
  },

  // ── Expand trade node (inline toggle) ────────────────────────────
  expandTradeNode: (nodeId: string) => {
    const state = get();
    const tradeNode = state.nodes.find((n) => n.id === nodeId);
    if (!tradeNode || (tradeNode.type !== 'trade' && tradeNode.type !== 'championship')) return;

    const newExpanded = new Set(state.expandedNodes);
    if (newExpanded.has(nodeId)) {
      // Collapse
      newExpanded.delete(nodeId);
    } else {
      // Expand
      newExpanded.add(nodeId);
    }

    // Boost z-index on expanded trade/championship nodes so their content
    // stays above neighboring nodes that may overlap after layout
    const nodesWithZ = state.nodes.map(n => {
      const shouldBoost = newExpanded.has(n.id) && (n.type === 'trade' || n.type === 'championship');
      const currentZ = n.zIndex;
      const newZ = shouldBoost ? 100 : undefined;
      if (currentZ === newZ) return n;
      return { ...n, zIndex: newZ };
    });

    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(nodesWithZ, state.edges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, nodeId);
      set({ nodes: laid, expandedNodes: newExpanded });
    } else {
      layoutGraph(nodesWithZ, state.edges, nodeId, newExpanded).then((laid) => {
        set({ nodes: laid, expandedNodes: newExpanded });
      });
    }
  },

  // ── Expand player stats inline within trade card ───────────────
  // Clicking a player name toggles their season stats inline in the trade card.
  expandInlineTradePlayer: async (tradeNodeId_: string, asset: TransactionAsset) => {
    const playerName = asset.player_name ?? asset.became_player_name;
    if (!playerName) return;
    const toTeamId = asset.to_team_id;
    if (!toTeamId) return;

    const state = get();
    const tradeNode = state.nodes.find(n => n.id === tradeNodeId_);
    if (!tradeNode || tradeNode.type !== 'trade') return;

    const currentData = tradeNode.data as TradeNodeData;
    const currentInline = currentData.inlinePlayers ?? {};

    // Toggle off if already expanded (and not loading)
    if (currentInline[playerName] && !currentInline[playerName].isLoading) {
      await get().collapseInlineTradePlayer(tradeNodeId_, playerName);
      return;
    }

    // Set loading state
    const loadingEntry: InlinePlayerData = {
      playerName, teamId: toTeamId, stintIndex: 0, seasons: [],
      avgPpg: null, avgRpg: null, avgApg: null, totalWinShares: null,
      accolades: [], isLoading: true,
    };

    const nodesWithLoading = state.nodes.map(n => {
      if (n.id !== tradeNodeId_) return n;
      return { ...n, data: { ...n.data, inlinePlayers: { ...currentInline, [playerName]: loadingEntry } } };
    });
    set({ nodes: nodesWithLoading });

    const sb = getSupabase();

    const { seasons: allSeasons, resolvedName } = await fetchSeasonsWithVariants(sb, playerName, toTeamId);

    const clearLoading = () => {
      const cs = get();
      const cleared = cs.nodes.map(n => {
        if (n.id !== tradeNodeId_) return n;
        const d = n.data as TradeNodeData;
        const ip = { ...(d.inlinePlayers ?? {}) };
        delete ip[playerName];
        return { ...n, data: { ...d, inlinePlayers: ip } };
      });
      set({ nodes: cleared });
    };

    const storeNeverPlayed = async () => {
      const neverPlayedEntry: InlinePlayerData = {
        playerName, teamId: toTeamId, stintIndex: 0, seasons: [],
        avgPpg: null, avgRpg: null, avgApg: null, totalWinShares: null,
        accolades: [], isLoading: false, neverPlayed: true,
      };
      const cs = get();
      const npNodes = cs.nodes.map(n => {
        if (n.id !== tradeNodeId_) return n;
        const d = n.data as TradeNodeData;
        return { ...n, data: { ...d, inlinePlayers: { ...(d.inlinePlayers ?? {}), [playerName]: neverPlayedEntry } } };
      });
      if (cs.layoutMode === 'timeline') {
        const laid = layoutPlayerTimeline(npNodes, cs.edges, cs.playerColumns, cs.expandedNodes, cs.expandedGapIds, cs.playerAnchorTrades, cs.playerAnchorDirections, tradeNodeId_);
        set({ nodes: laid });
      } else {
        const laid = await layoutGraph(npNodes, cs.edges, tradeNodeId_, cs.expandedNodes);
        set({ nodes: laid });
      }
    };

    if (!allSeasons || allSeasons.length === 0) { await storeNeverPlayed(); return; }

    const stints = groupIntoStints(allSeasons.filter(s => s.team_id));

    // Find first stint at receiving team
    let matchedIdx = -1;
    for (let i = 0; i < stints.length; i++) {
      if (stints[i].teamId === toTeamId) { matchedIdx = i; break; }
    }

    // Pick was re-traded before being used — show their actual stint instead of "No Games Played"
    if (matchedIdx === -1) {
      if (stints.length > 0) {
        matchedIdx = 0;
      } else {
        await storeNeverPlayed(); return;
      }
    }

    const stint = stints[matchedIdx];
    const stintSeasons = stint.seasons.map(s => s.season);
    const stintSeasonsSet = new Set(stintSeasons);

    // Fetch all data in parallel using session cache, then filter client-side
    const [allAccolades, allTeamSeasons, allContracts, allPlayoffGames] = await Promise.all([
      cachedPlayerAccolades(sb, resolvedName),
      cachedTeamSeasons(sb, toTeamId),
      cachedPlayerContracts(sb, resolvedName),
      cachedPlayoffGames(sb, resolvedName),
    ]);

    const accolades = allAccolades.filter(a => a.season && stintSeasonsSet.has(a.season));
    const teamSeasons = allTeamSeasons.filter(ts => stintSeasonsSet.has(ts.season));
    const contracts = allContracts.filter(c => c.team_id === toTeamId && stintSeasonsSet.has(c.season));
    const playoffGames = allPlayoffGames
      .filter(g => g.team_id === toTeamId && stintSeasonsSet.has(g.season))
      .sort((a, b) => b.game_score - a.game_score);

    const contractMap = new Map<string, PlayerContract>();
    for (const c of contracts) contractMap.set(c.season, c);

    const accoladesByS = new Map<string, string[]>();
    for (const a of accolades) {
      if (!a.season) continue;
      if (!accoladesByS.has(a.season)) accoladesByS.set(a.season, []);
      accoladesByS.get(a.season)!.push(a.accolade);
    }

    const teamSeasonMap = new Map<string, TeamSeason>();
    for (const ts of teamSeasons) teamSeasonMap.set(ts.season, ts);

    // Build playoff peak games and series data (same logic as expandStintDetails)
    const peakGamesBySeason = new Map<string, PlayoffPeakGame[]>();
    const seriesBySeason = new Map<string, PlayoffSeries[]>();
    if (playoffGames) {
      const chronological = [...playoffGames].sort((a, b) => a.game_date.localeCompare(b.game_date));
      const seriesMap = new Map<string, { opponentId: string; games: PlayoffSeriesGame[] }>();
      for (const g of chronological) {
        const key = `${g.season}|${g.opponent_id}`;
        if (!seriesMap.has(key)) seriesMap.set(key, { opponentId: g.opponent_id, games: [] });
        const series = seriesMap.get(key)!;
        series.games.push({ gameNumber: series.games.length + 1, gameDate: g.game_date, gameScore: g.game_score, pts: g.pts, trb: g.trb, ast: g.ast, result: g.result, gameMargin: g.game_margin });
      }
      const seriesBySeasonRaw = new Map<string, { key: string; opponentId: string; firstDate: string; games: PlayoffSeriesGame[] }[]>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const arr = seriesBySeasonRaw.get(season) || [];
        arr.push({ key, opponentId: series.opponentId, firstDate: series.games[0]?.gameDate ?? '', games: series.games });
        seriesBySeasonRaw.set(season, arr);
      }
      const roundLookup = new Map<string, number>();
      for (const [season, seriesList] of seriesBySeasonRaw) {
        seriesList.sort((a, b) => a.firstDate.localeCompare(b.firstDate));
        const builtSeries: PlayoffSeries[] = [];
        seriesList.forEach((s, i) => {
          const round = i + 1;
          roundLookup.set(`${season}|${s.opponentId}`, round);
          builtSeries.push({ opponentId: s.opponentId, round, games: s.games });
        });
        seriesBySeason.set(season, builtSeries);
      }
      const gameLookup = new Map<string, { gameNumber: number; round: number }>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const round = roundLookup.get(`${season}|${series.opponentId}`) ?? 1;
        for (const g of series.games) gameLookup.set(`${g.gameDate}|${series.opponentId}`, { gameNumber: g.gameNumber, round });
      }
      for (const g of playoffGames) {
        if (g.game_score < 20) continue;
        const arr = peakGamesBySeason.get(g.season) || [];
        if (arr.length < 1) {
          const info = gameLookup.get(`${g.game_date}|${g.opponent_id}`);
          arr.push({ gameScore: g.game_score, pts: g.pts, trb: g.trb, ast: g.ast, opponentId: g.opponent_id, gameDate: g.game_date, result: g.result, gameMargin: g.game_margin, gameNumber: info?.gameNumber ?? 0, round: info?.round ?? 1 });
          peakGamesBySeason.set(g.season, arr);
        }
      }
    }

    const allAccoladesList: string[] = [];
    for (const accs of accoladesByS.values()) allAccoladesList.push(...accs);

    const seasonDetails: SeasonDetailRow[] = stint.seasons.map(ss => ({
      season: ss.season,
      gp: ss.gp,
      ppg: ss.ppg,
      rpg: ss.rpg,
      apg: ss.apg,
      winShares: ss.win_shares,
      teamWins: teamSeasonMap.get(ss.season)?.wins ?? null,
      teamLosses: teamSeasonMap.get(ss.season)?.losses ?? null,
      playoffResult: teamSeasonMap.get(ss.season)?.playoff_result ?? null,
      accolades: accoladesByS.get(ss.season) ?? [],
      salary: contractMap.get(ss.season)?.salary ?? null,
      playoffPeakGames: peakGamesBySeason.get(ss.season),
      playoffSeries: seriesBySeason.get(ss.season),
    }));

    const inlineData: InlinePlayerData = {
      playerName,
      teamId: toTeamId,
      stintIndex: matchedIdx,
      seasons: stintSeasons,
      avgPpg: avg(stint.seasons.map(s => s.ppg)),
      avgRpg: avg(stint.seasons.map(s => s.rpg)),
      avgApg: avg(stint.seasons.map(s => s.apg)),
      totalWinShares: sum(stint.seasons.map(s => s.win_shares)),
      accolades: [...new Set(allAccoladesList)],
      seasonDetails,
      isLoading: false,
    };

    const currentState = get();
    const finalNodes = currentState.nodes.map(n => {
      if (n.id !== tradeNodeId_) return n;
      const d = n.data as TradeNodeData;
      return { ...n, data: { ...d, inlinePlayers: { ...(d.inlinePlayers ?? {}), [playerName]: inlineData } } };
    });

    if (currentState.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(finalNodes, currentState.edges, currentState.playerColumns, currentState.expandedNodes, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections, tradeNodeId_);
      set({ nodes: laid });
    } else {
      const laid = await layoutGraph(finalNodes, currentState.edges, tradeNodeId_, currentState.expandedNodes);
      set({ nodes: laid });
    }
  },

  // ── Collapse inline player stats from trade card ───────────────
  collapseInlineTradePlayer: async (tradeNodeId_: string, playerName: string) => {
    const state = get();
    const updatedNodes = state.nodes.map(n => {
      if (n.id !== tradeNodeId_) return n;
      const d = n.data as TradeNodeData;
      const ip = { ...(d.inlinePlayers ?? {}) };
      delete ip[playerName];
      return { ...n, data: { ...d, inlinePlayers: ip } };
    });
    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, tradeNodeId_);
      set({ nodes: laid });
    } else {
      const laid = await layoutGraph(updatedNodes, state.edges, tradeNodeId_, state.expandedNodes);
      set({ nodes: laid });
    }
  },

  // ── Expand player/pick from inline trade card ──────────────────
  // Clicking "Path →" on a player shows their trajectory FROM this trade onwards.
  // Only forward stints are created (receiving team + all subsequent teams/trades).
  // View focuses on the receiving team's stint, not their full career history.
  expandPlayerFromTrade: async (tradeNodeId_: string, asset: TransactionAsset) => {
    const state = get();

    // Expand as player journey: player assets directly, or picks with a resolved drafted player
    const expandAsPlayer =
      (asset.asset_type === 'player' && asset.player_name) ||
      ((asset.asset_type === 'pick' || asset.asset_type === 'swap') && asset.became_player_name);

    if (expandAsPlayer) {
      const playerName = (asset.player_name ?? asset.became_player_name)!;
      const toTeamId = asset.to_team_id;
      if (!toTeamId) return;

      // If forward stints at the receiving team already exist, skip.
      // Team-specific so backward/history expansion doesn't block this.
      const playerSlug = playerName.toLowerCase().replace(/\s+/g, '-');
      if (state.nodes.some(n => n.id.startsWith(`stint-${playerSlug}-${toTeamId}`))) return;

      const sb = getSupabase();

      const { seasons: allSeasons, resolvedName } = await fetchSeasonsWithVariants(sb, playerName, toTeamId);

      if (!allSeasons || allSeasons.length === 0) return;

      const stints = groupIntoStints(allSeasons.filter(s => s.team_id));
      if (stints.length === 0) return;

      // Find the first stint at the receiving team (starting point)
      let startIdx = -1;
      for (let i = 0; i < stints.length; i++) {
        if (stints[i].teamId === toTeamId) { startIdx = i; break; }
      }
      // Fallback: player was traded to toTeamId but never played there (immediately re-traded).
      // Use the first stint after the fromTeamId stint instead.
      if (startIdx === -1 && asset.from_team_id) {
        let fromIdx = -1;
        for (let i = 0; i < stints.length; i++) {
          if (stints[i].teamId === asset.from_team_id) { fromIdx = i; break; }
        }
        if (fromIdx >= 0 && fromIdx + 1 < stints.length) {
          startIdx = fromIdx + 1;
        }
      }
      // Pick was re-traded — player never played for from/to team. Show from first stint.
      if (startIdx === -1 && stints.length > 0) {
        startIdx = 0;
      }
      if (startIdx === -1) return;

      const forwardStints = stints.slice(startIdx);
      const allForwardSeasons = forwardStints.flatMap(s => s.seasons.map(ss => ss.season));

      // Fetch accolades (cached) and inter-stint trades in parallel
      const forwardSeasonsSet = new Set(allForwardSeasons);
      const accoladesPromise = cachedPlayerAccolades(sb, resolvedName)
        .then(all => all.filter(a => a.season && forwardSeasonsSet.has(a.season)))
        .catch(() => [] as PlayerAccolade[]);

      const interStintPromises: Promise<StaticTrade | null>[] = [];
      for (let i = 0; i < forwardStints.length - 1; i++) {
        const from = forwardStints[i];
        const to = forwardStints[i + 1];
        interStintPromises.push(
          findTradeBetweenStints(
            playerName, from.teamId, to.teamId,
            from.seasons[from.seasons.length - 1].season,
            to.seasons[0].season
          ).catch(() => null)
        );
      }

      const tradeResultsPromise = Promise.all(interStintPromises);
      const [accoladesData, tradeResults] = await Promise.all([accoladesPromise, tradeResultsPromise]);

      const accoladesBySeasonMap = new Map<string, string[]>();
      if (accoladesData) {
        for (const a of accoladesData) {
          if (!a.season) continue;
          if (!accoladesBySeasonMap.has(a.season)) accoladesBySeasonMap.set(a.season, []);
          accoladesBySeasonMap.get(a.season)!.push(a.accolade);
        }
      }

      const currentState = get();
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Create stint nodes for each forward stint
      for (let i = 0; i < forwardStints.length; i++) {
        const actualIdx = startIdx + i;
        const stint = forwardStints[i];
        const sid = stintNodeId(playerName, stint.teamId, actualIdx);
        if (currentState.nodes.find(n => n.id === sid) || newNodes.find(n => n.id === sid)) continue;

        const stintSeasons = stint.seasons.map(s => s.season);
        const stintAcc: string[] = [];
        for (const s of stintSeasons) {
          const acc = accoladesBySeasonMap.get(s);
          if (acc) stintAcc.push(...acc);
        }

        newNodes.push(makeStintNode(
          playerName, stint.teamId, actualIdx, stintSeasons,
          avg(stint.seasons.map(s => s.ppg)),
          avg(stint.seasons.map(s => s.rpg)),
          avg(stint.seasons.map(s => s.apg)),
          sum(stint.seasons.map(s => s.win_shares)),
          [...new Set(stintAcc)],
        ));
      }

      // Edge: existing trade node → first forward stint
      const firstSid = stintNodeId(playerName, forwardStints[0].teamId, startIdx);
      if (!edgeExists(newEdges, tradeNodeId_, firstSid) && !edgeExists(currentState.edges, tradeNodeId_, firstSid)) {
        newEdges.push(makeEdge(tradeNodeId_, firstSid));
      }

      // Inter-stint: Stint → Trade → Stint (or direct if no trade found)
      for (let i = 0; i < forwardStints.length - 1; i++) {
        const trade = tradeResults[i] as StaticTrade | null;
        const sid = stintNodeId(playerName, forwardStints[i].teamId, startIdx + i);
        const sidNext = stintNodeId(playerName, forwardStints[i + 1].teamId, startIdx + i + 1);

        if (trade) {
          const tradeNId = tradeNodeId(trade.id);
          if (!currentState.nodes.find(n => n.id === tradeNId) && !newNodes.find(n => n.id === tradeNId)) {
            newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
          }
          if (!edgeExists(newEdges, sid, tradeNId) && !edgeExists(currentState.edges, sid, tradeNId)) {
            newEdges.push(makeEdge(sid, tradeNId));
          }
          if (!edgeExists(newEdges, tradeNId, sidNext) && !edgeExists(currentState.edges, tradeNId, sidNext)) {
            newEdges.push(makeEdge(tradeNId, sidNext));
          }
        } else {
          if (!edgeExists(newEdges, sid, sidNext) && !edgeExists(currentState.edges, sid, sidNext)) {
            newEdges.push(makeEdge(sid, sidNext));
          }
        }
      }

      if (newNodes.length === 0 && newEdges.length === 0) return;

      // Assign player to a new timeline column
      let playerCols = currentState.playerColumns;
      let nextColIdx = currentState.nextColumnIndex;
      if (!playerCols.has(playerName)) {
        playerCols = new Map(playerCols);
        playerCols.set(playerName, nextColIdx);
        nextColIdx++;
      }

      // Record anchor trade and forward direction for layout alignment
      const newAnchorTrades = new Map(currentState.playerAnchorTrades);
      newAnchorTrades.set(playerName, tradeNodeId_);

      const newAnchorDirections = new Map(currentState.playerAnchorDirections);
      const existingDir = currentState.playerAnchorDirections.get(playerName);
      newAnchorDirections.set(playerName, existingDir === 'backward' ? 'both' : 'forward');

      const mergedNodes = [...currentState.nodes, ...newNodes];
      const mergedEdges = [...currentState.edges, ...newEdges];
      const cleaned = removeOrphanedNodes(mergedNodes, mergedEdges, currentState.coreNodes);
      const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections, tradeNodeId_);

      set({
        nodes: laid,
        edges: cleaned.edges,
        playerColumns: playerCols,
        playerAnchorTrades: newAnchorTrades,
        playerAnchorDirections: newAnchorDirections,
        nextColumnIndex: nextColIdx,
        layoutMode: 'timeline',
      });
    } else if (
      (asset.asset_type === 'pick' || asset.asset_type === 'swap') &&
      asset.pick_year
    ) {
      const pkid = pickNodeId(asset.transaction_id, asset.id);
      if (state.nodes.find((n) => n.id === pkid)) return;

      const node = makePickNode(asset, { x: 0, y: 0 });
      const edge = makeEdge(tradeNodeId_, pkid);
      const allNodes = [...state.nodes, node];
      const allEdges = [...state.edges, edge];
      const laid = await layoutGraph(allNodes, allEdges, tradeNodeId_, state.expandedNodes);
      set({ nodes: laid, edges: allEdges });

      if (asset.became_player_name) {
        setTimeout(() => get().expandPickNode(pkid), 100);
      }
    }
  },

  // ── Expand player history from trade card (← History) ────────────
  // Clicking "← History" on a player shows their trajectory BEFORE this trade.
  // Only backward stints are created (from-team + all prior teams/trades).
  // Column is assigned to the LEFT (negative index). Layout aligns the last
  // pre-trade stint directly above the anchor trade node.
  expandPlayerHistoryFromTrade: async (tradeNodeId_: string, asset: TransactionAsset) => {
    const state = get();

    if (asset.asset_type === 'player' && asset.player_name && asset.from_team_id) {
      const playerName = asset.player_name;
      const fromTeamId = asset.from_team_id;

      // If history stints at the from-team already exist, skip.
      // Team-specific so forward/path expansion doesn't block this.
      const playerSlug = playerName.toLowerCase().replace(/\s+/g, '-');
      if (state.nodes.some(n => n.id.startsWith(`stint-${playerSlug}-${fromTeamId}`))) return;

      const sb = getSupabase();

      const { seasons: allSeasons, resolvedName } = await fetchSeasonsWithVariants(sb, playerName, fromTeamId);

      if (!allSeasons || allSeasons.length === 0) return;

      const stints = groupIntoStints(allSeasons.filter(s => s.team_id));
      if (stints.length === 0) return;

      // Find the LAST stint at the from-team (the stint just before this trade)
      let endIdx = -1;
      for (let i = stints.length - 1; i >= 0; i--) {
        if (stints[i].teamId === fromTeamId) { endIdx = i; break; }
      }
      // Fallback: player was traded from fromTeamId but never played there (passed through).
      // Use the last stint before the toTeamId stint instead.
      if (endIdx === -1 && asset.to_team_id) {
        for (let i = 0; i < stints.length; i++) {
          if (stints[i].teamId === asset.to_team_id) {
            endIdx = i > 0 ? i - 1 : -1;
            break;
          }
        }
      }
      if (endIdx === -1) return;

      const historicalStints = stints.slice(0, endIdx + 1);
      const allHistoricalSeasons = historicalStints.flatMap(s => s.seasons.map(ss => ss.season));
      const historicalSeasonsSet = new Set(allHistoricalSeasons);

      // Fetch accolades (cached) and inter-stint trades in parallel
      const accoladesPromise = cachedPlayerAccolades(sb, resolvedName)
        .then(all => all.filter(a => a.season && historicalSeasonsSet.has(a.season)))
        .catch(() => [] as PlayerAccolade[]);

      const interStintPromises: Promise<StaticTrade | null>[] = [];
      for (let i = 0; i < historicalStints.length - 1; i++) {
        const from = historicalStints[i];
        const to = historicalStints[i + 1];
        interStintPromises.push(
          findTradeBetweenStints(
            playerName, from.teamId, to.teamId,
            from.seasons[from.seasons.length - 1].season,
            to.seasons[0].season
          ).catch(() => null)
        );
      }

      const tradeResultsPromise = Promise.all(interStintPromises);
      const [accoladesData, tradeResults] = await Promise.all([accoladesPromise, tradeResultsPromise]);

      const accoladesBySeasonMap = new Map<string, string[]>();
      if (accoladesData) {
        for (const a of accoladesData) {
          if (!a.season) continue;
          if (!accoladesBySeasonMap.has(a.season)) accoladesBySeasonMap.set(a.season, []);
          accoladesBySeasonMap.get(a.season)!.push(a.accolade);
        }
      }

      const currentState = get();
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Create stint nodes for each historical stint (index is their true career index)
      for (let i = 0; i < historicalStints.length; i++) {
        const stint = historicalStints[i];
        const sid = stintNodeId(playerName, stint.teamId, i);
        if (currentState.nodes.find(n => n.id === sid) || newNodes.find(n => n.id === sid)) continue;

        const stintSeasons = stint.seasons.map(s => s.season);
        const stintAcc: string[] = [];
        for (const s of stintSeasons) {
          const acc = accoladesBySeasonMap.get(s);
          if (acc) stintAcc.push(...acc);
        }

        newNodes.push(makeStintNode(
          playerName, stint.teamId, i, stintSeasons,
          avg(stint.seasons.map(s => s.ppg)),
          avg(stint.seasons.map(s => s.rpg)),
          avg(stint.seasons.map(s => s.apg)),
          sum(stint.seasons.map(s => s.win_shares)),
          [...new Set(stintAcc)],
        ));
      }

      // Inter-stint edges: Stint[i] → Trade → Stint[i+1] (or direct if no trade found)
      for (let i = 0; i < historicalStints.length - 1; i++) {
        const trade = tradeResults[i] as StaticTrade | null;
        const sid = stintNodeId(playerName, historicalStints[i].teamId, i);
        const sidNext = stintNodeId(playerName, historicalStints[i + 1].teamId, i + 1);

        if (trade) {
          const tradeNId = tradeNodeId(trade.id);
          if (!currentState.nodes.find(n => n.id === tradeNId) && !newNodes.find(n => n.id === tradeNId)) {
            newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
          }
          if (!edgeExists(newEdges, sid, tradeNId) && !edgeExists(currentState.edges, sid, tradeNId)) {
            newEdges.push(makeEdge(sid, tradeNId));
          }
          if (!edgeExists(newEdges, tradeNId, sidNext) && !edgeExists(currentState.edges, tradeNId, sidNext)) {
            newEdges.push(makeEdge(tradeNId, sidNext));
          }
        } else {
          if (!edgeExists(newEdges, sid, sidNext) && !edgeExists(currentState.edges, sid, sidNext)) {
            newEdges.push(makeEdge(sid, sidNext));
          }
        }
      }

      // Edge: last historical stint → anchor trade node.
      // Marked excludeFromTopoSort so the BFS doesn't push the anchor trade down,
      // displacing the primary player and any forward-path stints already on graph.
      const lastSid = stintNodeId(playerName, historicalStints[historicalStints.length - 1].teamId, endIdx);
      const anchorEdgeId = `e-${lastSid}-${tradeNodeId_}`;
      if (!edgeExists(newEdges, lastSid, tradeNodeId_) && !edgeExists(currentState.edges, lastSid, tradeNodeId_)) {
        newEdges.push({
          id: anchorEdgeId,
          source: lastSid,
          target: tradeNodeId_,
          type: 'highlightable',
          animated: false,
          style: { stroke: '#555', strokeWidth: 1.5 },
          data: { excludeFromTopoSort: true },
        });
      }

      if (newNodes.length === 0 && newEdges.length === 0) return;

      // Assign player to a left-side (negative) column, OR reuse existing column
      // if both directions are being shown for the same player.
      let playerCols = currentState.playerColumns;
      let prevColIdx = currentState.prevColumnIndex;
      if (!playerCols.has(playerName)) {
        playerCols = new Map(playerCols);
        playerCols.set(playerName, prevColIdx);
        prevColIdx--;
      }

      // Record anchor trade and direction (backward, or both if forward already exists)
      const newAnchorTrades = new Map(currentState.playerAnchorTrades);
      newAnchorTrades.set(playerName, tradeNodeId_);

      const newAnchorDirections = new Map(currentState.playerAnchorDirections);
      const existingDir = currentState.playerAnchorDirections.get(playerName);
      newAnchorDirections.set(playerName, existingDir === 'forward' ? 'both' : 'backward');

      const mergedNodes = [...currentState.nodes, ...newNodes];
      const mergedEdges = [...currentState.edges, ...newEdges];
      const cleaned = removeOrphanedNodes(mergedNodes, mergedEdges, currentState.coreNodes);
      const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections, tradeNodeId_);

      set({
        nodes: laid,
        edges: cleaned.edges,
        playerColumns: playerCols,
        playerAnchorTrades: newAnchorTrades,
        playerAnchorDirections: newAnchorDirections,
        prevColumnIndex: prevColIdx,
        layoutMode: 'timeline',
      });
    }
  },

  // ── Expand player full path from trade (combined forward + backward) ──
  // Single-click "Path" replaces both "← Hist" and "Path →".
  // Creates backward stints (before the trade) AND forward stints (after the trade)
  // in one atomic operation, anchored on the trade node as the pivot.
  expandPlayerFullPathFromTrade: async (tradeNodeId_: string, asset: TransactionAsset) => {
    const state = get();

    // Picks without a resolved player — fall back to simple pick node
    if ((asset.asset_type === 'pick' || asset.asset_type === 'swap') && !asset.became_player_name) {
      return get().expandPlayerFromTrade(tradeNodeId_, asset);
    }
    // Picks with became_player_name: fall through to career journey code
    // which creates stint nodes in a side column with inter-stint trades

    // Determine player name: from player asset or from pick's became_player_name
    const playerName = asset.player_name ?? asset.became_player_name;
    if (!playerName) return;
    const toTeamId = asset.to_team_id;
    const fromTeamId = asset.from_team_id;
    if (!toTeamId) return;

    // Guard: if any stint for this player already exists, their path is on the graph
    // (covers players traded to a team they never played for, e.g. Beverley MIN→UTA→LAL)
    const playerSlug = playerName.toLowerCase().replace(/\s+/g, '-');
    const stintPrefix = `stint-${playerSlug}-`;
    if (state.nodes.some(n => n.id.startsWith(stintPrefix))) return;

    const sb = getSupabase();

    const { seasons: allSeasons, resolvedName } = await fetchSeasonsWithVariants(sb, playerName, toTeamId);

    if (!allSeasons || allSeasons.length === 0) return;

    const stints = groupIntoStints(allSeasons.filter(s => s.team_id));
    if (stints.length === 0) return;

    // Find startIdx — the stint at toTeamId that follows the fromTeamId stint
    // for THIS trade. Simple "first stint at toTeamId" breaks for boomerang players
    // (e.g., Gugliotta ATL→BOS→ATL: picks the old ATL stint instead of post-trade).
    let startIdx = -1;
    let fromStintIdx = -1; // The from-team stint that anchors this trade

    if (fromTeamId) {
      // Get trade season from the anchor trade node to disambiguate
      const tradeNode = state.nodes.find(n => n.id === tradeNodeId_);
      const tradeSeason = tradeNode ? (tradeNode.data as TradeNodeData).trade.season : null;

      // Find the fromTeamId stint whose last season reaches the trade season
      for (let i = 0; i < stints.length; i++) {
        if (stints[i].teamId === fromTeamId) {
          const lastSeason = stints[i].seasons[stints[i].seasons.length - 1].season;
          if (!tradeSeason || lastSeason >= tradeSeason) {
            fromStintIdx = i;
            break;
          }
          fromStintIdx = i; // keep as fallback (latest before trade)
        }
      }

      if (fromStintIdx >= 0) {
        // Look for first toTeamId stint after the from-stint
        for (let j = fromStintIdx + 1; j < stints.length; j++) {
          if (stints[j].teamId === toTeamId) { startIdx = j; break; }
        }
        // Player never played for toTeamId (immediately re-traded) — use next stint
        if (startIdx === -1 && fromStintIdx + 1 < stints.length) {
          startIdx = fromStintIdx + 1;
        }
      }
    }

    // Fallback: no fromTeamId — use first stint at toTeamId
    if (startIdx === -1) {
      for (let i = 0; i < stints.length; i++) {
        if (stints[i].teamId === toTeamId) { startIdx = i; break; }
      }
    }
    // Pick was re-traded — player never played for from/to team. Show from first stint.
    if (startIdx === -1 && stints.length > 0) {
      startIdx = 0;
    }
    if (startIdx === -1) return;

    // Find endIdx — the from-stint for backward direction
    let endIdx = -1;
    const hasBackward = !!fromTeamId && fromTeamId !== toTeamId;
    if (hasBackward) {
      if (fromStintIdx >= 0 && fromStintIdx < startIdx) {
        endIdx = fromStintIdx;
      } else {
        // Fallback to original logic
        for (let i = stints.length - 1; i >= 0; i--) {
          if (stints[i].teamId === fromTeamId) { endIdx = i; break; }
        }
      }
    }
    // If backward stint comes after forward stint, skip backward (data anomaly guard)
    if (endIdx >= startIdx) endIdx = -1;

    const forwardStints = stints.slice(startIdx);
    const backwardStints = endIdx >= 0 ? stints.slice(0, endIdx + 1) : [];

    // Collect ALL seasons for accolades filtering
    const allRelevantSeasons = new Set([
      ...backwardStints.flatMap(s => s.seasons.map(ss => ss.season)),
      ...forwardStints.flatMap(s => s.seasons.map(ss => ss.season)),
    ]);

    // Fetch accolades (cached full career, filter client-side)
    const accoladesPromise = cachedPlayerAccolades(sb, resolvedName)
      .then(all => all.filter(a => a.season && allRelevantSeasons.has(a.season)))
      .catch(() => [] as PlayerAccolade[]);

    // Fetch inter-stint trades for FORWARD direction
    const forwardTradePromises: Promise<StaticTrade | null>[] = [];
    for (let i = 0; i < forwardStints.length - 1; i++) {
      const from = forwardStints[i];
      const to = forwardStints[i + 1];
      forwardTradePromises.push(
        findTradeBetweenStints(
          playerName, from.teamId, to.teamId,
          from.seasons[from.seasons.length - 1].season,
          to.seasons[0].season
        ).catch(() => null)
      );
    }

    // Fetch inter-stint trades for BACKWARD direction
    const backwardTradePromises: Promise<StaticTrade | null>[] = [];
    for (let i = 0; i < backwardStints.length - 1; i++) {
      const from = backwardStints[i];
      const to = backwardStints[i + 1];
      backwardTradePromises.push(
        findTradeBetweenStints(
          playerName, from.teamId, to.teamId,
          from.seasons[from.seasons.length - 1].season,
          to.seasons[0].season
        ).catch(() => null)
      );
    }

    // Await all fetches in parallel
    const [accoladesData, forwardTradeResults, backwardTradeResults] = await Promise.all([
      accoladesPromise,
      Promise.all(forwardTradePromises),
      Promise.all(backwardTradePromises),
    ]);

    const accoladesBySeasonMap = new Map<string, string[]>();
    if (accoladesData) {
      for (const a of accoladesData) {
        if (!a.season) continue;
        if (!accoladesBySeasonMap.has(a.season)) accoladesBySeasonMap.set(a.season, []);
        accoladesBySeasonMap.get(a.season)!.push(a.accolade);
      }
    }

    const currentState = get();
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Helper: collect accolades for a stint's seasons
    const getStintAccolades = (stintSeasons: string[]): string[] => {
      const acc: string[] = [];
      for (const s of stintSeasons) {
        const a = accoladesBySeasonMap.get(s);
        if (a) acc.push(...a);
      }
      return [...new Set(acc)];
    };

    // === BACKWARD STINTS ===
    if (backwardStints.length > 0) {
      // Create stint nodes
      for (let i = 0; i < backwardStints.length; i++) {
        const stint = backwardStints[i];
        const sid = stintNodeId(playerName, stint.teamId, i);
        if (currentState.nodes.find(n => n.id === sid) || newNodes.find(n => n.id === sid)) continue;

        const stintSeasons = stint.seasons.map(s => s.season);
        newNodes.push(makeStintNode(
          playerName, stint.teamId, i, stintSeasons,
          avg(stint.seasons.map(s => s.ppg)),
          avg(stint.seasons.map(s => s.rpg)),
          avg(stint.seasons.map(s => s.apg)),
          sum(stint.seasons.map(s => s.win_shares)),
          getStintAccolades(stintSeasons),
        ));
      }

      // Inter-stint edges for backward
      for (let i = 0; i < backwardStints.length - 1; i++) {
        const trade = backwardTradeResults[i] as StaticTrade | null;
        const sid = stintNodeId(playerName, backwardStints[i].teamId, i);
        const sidNext = stintNodeId(playerName, backwardStints[i + 1].teamId, i + 1);

        if (trade) {
          const tradeNId = tradeNodeId(trade.id);
          if (!currentState.nodes.find(n => n.id === tradeNId) && !newNodes.find(n => n.id === tradeNId)) {
            newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
          }
          if (!edgeExists(newEdges, sid, tradeNId) && !edgeExists(currentState.edges, sid, tradeNId))
            newEdges.push(makeEdge(sid, tradeNId));
          if (!edgeExists(newEdges, tradeNId, sidNext) && !edgeExists(currentState.edges, tradeNId, sidNext))
            newEdges.push(makeEdge(tradeNId, sidNext));
        } else {
          if (!edgeExists(newEdges, sid, sidNext) && !edgeExists(currentState.edges, sid, sidNext))
            newEdges.push(makeEdge(sid, sidNext));
        }
      }

      // Backward-anchor edge: last backward stint → anchor trade node
      // Marked excludeFromTopoSort so BFS doesn't push the anchor trade down
      const lastBackwardSid = stintNodeId(playerName, backwardStints[backwardStints.length - 1].teamId, endIdx);
      if (!edgeExists(newEdges, lastBackwardSid, tradeNodeId_) && !edgeExists(currentState.edges, lastBackwardSid, tradeNodeId_)) {
        newEdges.push({
          id: `e-${lastBackwardSid}-${tradeNodeId_}`,
          source: lastBackwardSid,
          target: tradeNodeId_,
          type: 'highlightable',
          animated: false,
          style: { stroke: '#555', strokeWidth: 1.5 },
          data: { excludeFromTopoSort: true },
        });
      }
    }

    // === FORWARD STINTS ===
    // Create stint nodes
    for (let i = 0; i < forwardStints.length; i++) {
      const actualIdx = startIdx + i;
      const stint = forwardStints[i];
      const sid = stintNodeId(playerName, stint.teamId, actualIdx);
      if (currentState.nodes.find(n => n.id === sid) || newNodes.find(n => n.id === sid)) continue;

      const stintSeasons = stint.seasons.map(s => s.season);
      newNodes.push(makeStintNode(
        playerName, stint.teamId, actualIdx, stintSeasons,
        avg(stint.seasons.map(s => s.ppg)),
        avg(stint.seasons.map(s => s.rpg)),
        avg(stint.seasons.map(s => s.apg)),
        sum(stint.seasons.map(s => s.win_shares)),
        getStintAccolades(stintSeasons),
      ));
    }

    // Edge: anchor trade → first forward stint
    const firstForwardSid = stintNodeId(playerName, forwardStints[0].teamId, startIdx);
    if (!edgeExists(newEdges, tradeNodeId_, firstForwardSid) && !edgeExists(currentState.edges, tradeNodeId_, firstForwardSid)) {
      newEdges.push(makeEdge(tradeNodeId_, firstForwardSid));
    }

    // Inter-stint edges for forward
    for (let i = 0; i < forwardStints.length - 1; i++) {
      const trade = forwardTradeResults[i] as StaticTrade | null;
      const sid = stintNodeId(playerName, forwardStints[i].teamId, startIdx + i);
      const sidNext = stintNodeId(playerName, forwardStints[i + 1].teamId, startIdx + i + 1);

      if (trade) {
        const tradeNId = tradeNodeId(trade.id);
        if (!currentState.nodes.find(n => n.id === tradeNId) && !newNodes.find(n => n.id === tradeNId)) {
          newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
        }
        if (!edgeExists(newEdges, sid, tradeNId) && !edgeExists(currentState.edges, sid, tradeNId))
          newEdges.push(makeEdge(sid, tradeNId));
        if (!edgeExists(newEdges, tradeNId, sidNext) && !edgeExists(currentState.edges, tradeNId, sidNext))
          newEdges.push(makeEdge(tradeNId, sidNext));
      } else {
        if (!edgeExists(newEdges, sid, sidNext) && !edgeExists(currentState.edges, sid, sidNext))
          newEdges.push(makeEdge(sid, sidNext));
      }
    }

    if (newNodes.length === 0 && newEdges.length === 0) return;

    // Assign player to a POSITIVE column (both directions share one column)
    let playerCols = currentState.playerColumns;
    let nextColIdx = currentState.nextColumnIndex;
    if (!playerCols.has(playerName)) {
      playerCols = new Map(playerCols);
      playerCols.set(playerName, nextColIdx);
      nextColIdx++;
    }

    // Record anchor trade and direction
    const newAnchorTrades = new Map(currentState.playerAnchorTrades);
    newAnchorTrades.set(playerName, tradeNodeId_);

    const newAnchorDirections = new Map(currentState.playerAnchorDirections);
    newAnchorDirections.set(playerName, backwardStints.length > 0 ? 'both' : 'forward');

    const mergedNodes = [...currentState.nodes, ...newNodes];
    const mergedEdges = [...currentState.edges, ...newEdges];
    const cleaned = removeOrphanedNodes(mergedNodes, mergedEdges, currentState.coreNodes);
    const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections, tradeNodeId_);

    set({
      nodes: laid,
      edges: cleaned.edges,
      playerColumns: playerCols,
      playerAnchorTrades: newAnchorTrades,
      playerAnchorDirections: newAnchorDirections,
      nextColumnIndex: nextColIdx,
      layoutMode: 'timeline',
    });
  },

  // ── Expand player node ───────────────────────────────────────────
  expandPlayerNode: async (nodeId: string) => {
    const state = get();
    if (state.expandedNodes.has(nodeId)) return;
    if (state.loadingNodes.has(nodeId)) return;

    set({ loadingNodes: new Set([...state.loadingNodes, nodeId]) });

    const playerNode = state.nodes.find((n) => n.id === nodeId);
    if (!playerNode || playerNode.type !== 'player') {
      set({ loadingNodes: new Set([...get().loadingNodes].filter((id) => id !== nodeId)) });
      return;
    }

    const playerName = (playerNode.data as PlayerNodeData).name;
    const sb = getSupabase();

    // Check if we have journey data
    const { data: seasonCheck } = await sb
      .from('player_seasons')
      .select('player_name')
      .ilike('player_name', playerName)
      .limit(1) as { data: { player_name: string }[] | null };

    if (seasonCheck && seasonCheck.length > 0) {
      // Use journey expansion
      await get().expandPlayerJourney(playerName, nodeId);
      return;
    }

    // Fallback: find trades involving this player from static JSON
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const staticResult = await searchStaticTrades(playerName);
    const playerTrades = staticResult.trades
      .filter((t) => t.assets.some(
        (a) => a.player_name?.toLowerCase() === playerName.toLowerCase()
      ))
      .map(staticTradeToTradeWithDetails);

    for (const trade of playerTrades.slice(0, 10)) {
      const tid = tradeNodeId(trade.id);
      if (!state.nodes.find((n) => n.id === tid) && !newNodes.find((n) => n.id === tid)) {
        newNodes.push(makeTradeNode(trade));
        newEdges.push(makeEdge(nodeId, tid));
      }
    }

    const currentState = get();
    const allNodes = [...currentState.nodes, ...newNodes];
    const allEdges = [...currentState.edges, ...newEdges];

    const newExpanded = new Set(currentState.expandedNodes);
    newExpanded.add(nodeId);
    const newCore = new Set(currentState.coreNodes);
    newCore.add(nodeId);
    for (const n of newNodes) newCore.add(n.id);
    const laid = await layoutGraph(allNodes, allEdges, nodeId, newExpanded);
    const newLoading = new Set([...currentState.loadingNodes].filter((id) => id !== nodeId));

    set({
      nodes: laid,
      edges: allEdges,
      expandedNodes: newExpanded,
      loadingNodes: newLoading,
      coreNodes: newCore,
    });
  },

  // ── Championship Roster: hub card + expand player paths ──────────────

  seedChampionshipRoster: async (teamId: string, season: string) => {
    const sb = getSupabase();

    // 1. Fetch roster + ingredients in parallel
    const [{ data: rosterSeasons }, { data: ingredientsRows }] = await Promise.all([
      sb
        .from('player_seasons')
        .select('*')
        .eq('team_id', teamId)
        .eq('season', season)
        .order('playoff_ws', { ascending: false }) as unknown as Promise<{ data: PlayerSeason[] | null }>,
      sb
        .from('championship_ingredients')
        .select('trade_pct, draft_pct, fa_pct')
        .eq('team_id', teamId)
        .eq('season', season)
        .limit(1) as unknown as Promise<{ data: { trade_pct: number; draft_pct: number; fa_pct: number }[] | null }>,
    ]);

    if (!rosterSeasons || rosterSeasons.length === 0) return;

    const ingredients: ChampionshipIngredients | undefined = ingredientsRows?.[0]
      ? { tradePct: ingredientsRows[0].trade_pct, draftPct: ingredientsRows[0].draft_pct, faPct: ingredientsRows[0].fa_pct }
      : undefined;

    // 2. Batch-fetch all players' full careers in ONE query (replaces N individual queries)
    const rosterNames = [...new Set(rosterSeasons.map(ps => ps.player_name))];
    const { data: allCareers } = await sb
      .from('player_seasons').select('*')
      .in('player_name', rosterNames)
      .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

    // Populate the session cache for each player while we have the data
    const careersByPlayer = new Map<string, PlayerSeason[]>();
    if (allCareers) {
      for (const s of allCareers) {
        const key = s.player_name;
        if (!careersByPlayer.has(key)) careersByPlayer.set(key, []);
        careersByPlayer.get(key)!.push(s);
      }
      // Warm the cache so later calls (expandStintDetails etc.) don't re-fetch
      for (const [name, seasons] of careersByPlayer) {
        _playerSeasonsCache.set(name.toLowerCase(), seasons);
      }
    }

    // For each player, build stint data + draft info in parallel
    const playerDataPromises = rosterSeasons.map(async (ps) => {
      const [allSeasons, draftInfo] = await Promise.all([
        Promise.resolve(careersByPlayer.get(ps.player_name) ?? []),
        getDraftInfo(ps.player_name).catch(() => null),
      ]);

      if (allSeasons.length === 0) return null;

      const stints = groupIntoStints(allSeasons.filter(s => s.team_id));
      const champIdx = stints.findIndex(s =>
        s.teamId === teamId && s.seasons.some(ss => ss.season === season)
      );
      if (champIdx === -1) return null;

      return {
        playerName: ps.player_name,
        playoffWs: ps.playoff_ws ?? null,
        playoffPpg: ps.playoff_ppg ?? null,
        playoffRpg: ps.playoff_rpg ?? null,
        playoffApg: ps.playoff_apg ?? null,
        playoffGp: ps.playoff_gp ?? null,
        allStints: stints,
        championshipStintIndex: champIdx,
        draftInfo: draftInfo ? { year: draftInfo.year, round: draftInfo.round, pick: draftInfo.pick } : null,
        earliestVisibleStintIndex: champIdx,
      } satisfies ChampionshipPlayerData;
    });

    const allPlayerData = (await Promise.all(playerDataPromises))
      .filter((p): p is ChampionshipPlayerData => p !== null);

    allPlayerData.sort((a, b) => (b.playoffWs ?? 0) - (a.playoffWs ?? 0));

    if (allPlayerData.length === 0) return;

    // 3. Create ONE championship hub node
    const teamInfo = getAnyTeamDisplayInfo(teamId, `${season.split('-')[0]}-06-15`);
    const champNode = makeChampionshipNode(
      teamId,
      season,
      teamInfo.name,
      teamInfo.color || '#9b5de5',
      allPlayerData.map(pd => {
        const champStint = pd.allStints[pd.championshipStintIndex];
        return {
          playerName: pd.playerName,
          avgPpg: avg(champStint.seasons.map(s => s.ppg)),
          avgRpg: avg(champStint.seasons.map(s => s.rpg)),
          avgApg: avg(champStint.seasons.map(s => s.apg)),
          playoffPpg: pd.playoffPpg,
          playoffRpg: pd.playoffRpg,
          playoffApg: pd.playoffApg,
          playoffGp: pd.playoffGp,
          playoffWs: pd.playoffWs,
          totalWinShares: sum(champStint.seasons.map(s => s.win_shares)),
        };
      }),
      { x: 0, y: 0 },
      ingredients,
    );

    set({
      nodes: [champNode],
      edges: [],
      expandedNodes: new Set([champNode.id]),
      loadingNodes: new Set(),
      coreNodes: new Set([champNode.id]),
      layoutMode: 'timeline',
      playerColumns: new Map(),
      playerAnchorTrades: new Map(),
      playerAnchorDirections: new Map(),
      nextColumnIndex: 0,
      prevColumnIndex: -1,
      pendingFitTarget: champNode.id,
      expandedGapIds: new Set(),
      seedInfo: { type: 'championship', teamId, season },
      championshipContext: {
        teamId,
        season,
        players: allPlayerData,
        expandedPaths: new Set(),
        playerPhases: new Map(),
      },
    });
  },

  // Seeds a single player's road-to-championship journey (Phase 1: stints 0..champIdx)
  expandChampionshipPlayer: async (playerName: string) => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    const playerData = ctx.players.find(p => p.playerName === playerName);
    if (!playerData) return;

    // Already expanded
    if (ctx.expandedPaths.has(playerName)) return;

    const champNodeId_ = championshipNodeId(ctx.teamId, ctx.season);
    const stints = playerData.allStints;
    const champIdx = playerData.championshipStintIndex;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Phase 1: Create stint nodes for stints 0 through championshipStintIndex (inclusive)
    for (let i = 0; i <= champIdx; i++) {
      const stint = stints[i];
      const stintSeasons = stint.seasons.map(s => s.season);
      let node = makeStintNode(
        playerName, stint.teamId, i, stintSeasons,
        avg(stint.seasons.map(s => s.ppg)),
        avg(stint.seasons.map(s => s.rpg)),
        avg(stint.seasons.map(s => s.apg)),
        sum(stint.seasons.map(s => s.win_shares)),
        [],
      );
      if (i === 0 && playerData.draftInfo) {
        node = { ...node, data: { ...node.data,
          draftYear: playerData.draftInfo.year,
          draftRound: playerData.draftInfo.round,
          draftPick: playerData.draftInfo.pick,
        } };
      }
      if (i === champIdx) {
        node = { ...node, data: { ...node.data, playoffWs: playerData.playoffWs } };
      }
      newNodes.push(node);
    }

    // Find trades between consecutive stints in the road-to-championship range
    interface TradeLookup {
      prevSid: string;
      currSid: string;
      trade: StaticTrade | null;
    }
    const tradePromises: Promise<TradeLookup>[] = [];
    for (let i = 0; i < champIdx; i++) {
      const fromStint = stints[i];
      const toStint = stints[i + 1];
      const fromLastSeason = fromStint.seasons[fromStint.seasons.length - 1].season;
      const toFirstSeason = toStint.seasons[0].season;
      tradePromises.push(
        findTradeBetweenStints(playerName, fromStint.teamId, toStint.teamId, fromLastSeason, toFirstSeason)
          .catch(() => null)
          .then(trade => ({
            prevSid: stintNodeId(playerName, fromStint.teamId, i),
            currSid: stintNodeId(playerName, toStint.teamId, i + 1),
            trade,
          }))
      );
    }

    const tradeResults = await Promise.all(tradePromises);
    for (const { prevSid, currSid, trade } of tradeResults) {
      if (trade) {
        const tId = tradeNodeId(trade.id);
        if (!state.nodes.find(n => n.id === tId) && !newNodes.find(n => n.id === tId)) {
          newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
        }
        if (!edgeExists(newEdges, prevSid, tId) && !edgeExists(state.edges, prevSid, tId))
          newEdges.push(makeEdge(prevSid, tId));
        if (!edgeExists(newEdges, tId, currSid) && !edgeExists(state.edges, tId, currSid))
          newEdges.push(makeEdge(tId, currSid));
      } else {
        if (!edgeExists(newEdges, prevSid, currSid) && !edgeExists(state.edges, prevSid, currSid))
          newEdges.push(makeEdge(prevSid, currSid));
      }
    }

    // Edge from championship node to championship stint
    // Excluded from topo sort so the stint sits at its natural Y in its own column
    // beside the championship card, not forced below it
    const champStintId = stintNodeId(playerName, stints[champIdx].teamId, champIdx);
    if (!edgeExists(newEdges, champNodeId_, champStintId) && !edgeExists(state.edges, champNodeId_, champStintId)) {
      newEdges.push({
        id: `e-${champNodeId_}-${champStintId}`,
        source: champNodeId_,
        target: champStintId,
        type: 'highlightable',
        animated: false,
        style: { stroke: '#555', strokeWidth: 1.5 },
        data: { excludeFromTopoSort: true },
      });
    }

    // Assign column for this player
    const col = state.nextColumnIndex;
    const newPlayerCols = new Map(state.playerColumns);
    newPlayerCols.set(playerName, col);

    // Merge
    const allNodes = [...state.nodes, ...newNodes];
    const allEdges = [...state.edges, ...newEdges];
    const newCore = new Set(state.coreNodes);
    for (const n of newNodes) newCore.add(n.id);

    const newExpandedPaths = new Set(ctx.expandedPaths);
    newExpandedPaths.add(playerName);

    const newPhases = new Map(ctx.playerPhases);
    newPhases.set(playerName, 'road');

    // Layout
    const laid = layoutPlayerTimeline(allNodes, allEdges, newPlayerCols, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, champNodeId_);

    set({
      nodes: laid,
      edges: allEdges,
      coreNodes: newCore,
      playerColumns: newPlayerCols,
      nextColumnIndex: col + 1,
      championshipContext: { ...ctx, expandedPaths: newExpandedPaths, playerPhases: newPhases },
    });
  },

  // Batch-expand Phase 1 paths (road to championship) for all players not yet on graph
  expandAllChampionshipPlayers: async () => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    const toExpand = ctx.players.filter(p => !ctx.expandedPaths.has(p.playerName));
    if (toExpand.length === 0) return;

    const champNodeId_ = championshipNodeId(ctx.teamId, ctx.season);
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const newPlayerCols = new Map(state.playerColumns);
    let nextCol = state.nextColumnIndex;
    const newExpandedPaths = new Set(ctx.expandedPaths);
    const newPhases = new Map(ctx.playerPhases);

    interface TradeLookup {
      prevSid: string;
      currSid: string;
      trade: StaticTrade | null;
    }
    const tradePromises: Promise<TradeLookup>[] = [];

    for (const pd of toExpand) {
      const stints = pd.allStints;
      const champIdx = pd.championshipStintIndex;
      newPlayerCols.set(pd.playerName, nextCol);
      nextCol++;
      newExpandedPaths.add(pd.playerName);
      newPhases.set(pd.playerName, 'road');

      // Phase 1: Create stint nodes only for stints 0 through champIdx
      for (let i = 0; i <= champIdx; i++) {
        const stint = stints[i];
        const stintSeasons = stint.seasons.map(s => s.season);
        let node = makeStintNode(
          pd.playerName, stint.teamId, i, stintSeasons,
          avg(stint.seasons.map(s => s.ppg)),
          avg(stint.seasons.map(s => s.rpg)),
          avg(stint.seasons.map(s => s.apg)),
          sum(stint.seasons.map(s => s.win_shares)),
          [],
        );
        if (i === 0 && pd.draftInfo) {
          node = { ...node, data: { ...node.data,
            draftYear: pd.draftInfo.year, draftRound: pd.draftInfo.round, draftPick: pd.draftInfo.pick } };
        }
        if (i === champIdx) {
          node = { ...node, data: { ...node.data, playoffWs: pd.playoffWs } };
        }
        newNodes.push(node);
      }

      // Find trades between consecutive stints (only 0..champIdx range)
      for (let i = 0; i < champIdx; i++) {
        const fromStint = stints[i];
        const toStint = stints[i + 1];
        const fromLastSeason = fromStint.seasons[fromStint.seasons.length - 1].season;
        const toFirstSeason = toStint.seasons[0].season;
        tradePromises.push(
          findTradeBetweenStints(pd.playerName, fromStint.teamId, toStint.teamId, fromLastSeason, toFirstSeason)
            .catch(() => null)
            .then(trade => ({
              prevSid: stintNodeId(pd.playerName, fromStint.teamId, i),
              currSid: stintNodeId(pd.playerName, toStint.teamId, i + 1),
              trade,
            }))
        );
      }

      // Edge from championship node to championship stint
      // Excluded from topo sort so stints sit beside the championship card
      const champStintId = stintNodeId(pd.playerName, stints[champIdx].teamId, champIdx);
      if (!edgeExists(newEdges, champNodeId_, champStintId)) {
        newEdges.push({
          id: `e-${champNodeId_}-${champStintId}`,
          source: champNodeId_,
          target: champStintId,
          type: 'highlightable',
          animated: false,
          style: { stroke: '#555', strokeWidth: 1.5 },
          data: { excludeFromTopoSort: true },
        });
      }
    }

    const tradeResults = await Promise.all(tradePromises);
    for (const { prevSid, currSid, trade } of tradeResults) {
      if (trade) {
        const tId = tradeNodeId(trade.id);
        if (!state.nodes.find(n => n.id === tId) && !newNodes.find(n => n.id === tId))
          newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
        if (!edgeExists(newEdges, prevSid, tId) && !edgeExists(state.edges, prevSid, tId))
          newEdges.push(makeEdge(prevSid, tId));
        if (!edgeExists(newEdges, tId, currSid) && !edgeExists(state.edges, tId, currSid))
          newEdges.push(makeEdge(tId, currSid));
      } else {
        if (!edgeExists(newEdges, prevSid, currSid) && !edgeExists(state.edges, prevSid, currSid))
          newEdges.push(makeEdge(prevSid, currSid));
      }
    }

    const allNodes = [...state.nodes, ...newNodes];
    const allEdges = [...state.edges, ...newEdges];
    const newCore = new Set(state.coreNodes);
    for (const n of newNodes) newCore.add(n.id);

    const laid = layoutPlayerTimeline(allNodes, allEdges, newPlayerCols, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, champNodeId_);

    set({
      nodes: laid,
      edges: allEdges,
      coreNodes: newCore,
      playerColumns: newPlayerCols,
      nextColumnIndex: nextCol,
      championshipContext: { ...ctx, expandedPaths: newExpandedPaths, playerPhases: newPhases },
    });
  },

  // Phase 2: Expand post-championship stints for a single player
  expandChampionshipPlayerAfter: async (playerName: string) => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    const playerData = ctx.players.find(p => p.playerName === playerName);
    if (!playerData) return;

    // Must already be in 'road' phase
    if (ctx.playerPhases.get(playerName) !== 'road') return;

    const stints = playerData.allStints;
    const champIdx = playerData.championshipStintIndex;

    // No post-championship stints to show
    if (champIdx >= stints.length - 1) return;

    const champNodeId_ = championshipNodeId(ctx.teamId, ctx.season);
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Create stint nodes for champIdx+1 through end
    for (let i = champIdx + 1; i < stints.length; i++) {
      const stint = stints[i];
      const stintSeasons = stint.seasons.map(s => s.season);
      const node = makeStintNode(
        playerName, stint.teamId, i, stintSeasons,
        avg(stint.seasons.map(s => s.ppg)),
        avg(stint.seasons.map(s => s.rpg)),
        avg(stint.seasons.map(s => s.apg)),
        sum(stint.seasons.map(s => s.win_shares)),
        [],
      );
      newNodes.push(node);
    }

    // Find trades between consecutive post-championship stints
    // Start from champIdx to connect the championship stint to the next
    interface TradeLookup {
      prevSid: string;
      currSid: string;
      trade: StaticTrade | null;
    }
    const tradePromises: Promise<TradeLookup>[] = [];
    for (let i = champIdx; i < stints.length - 1; i++) {
      const fromStint = stints[i];
      const toStint = stints[i + 1];
      const fromLastSeason = fromStint.seasons[fromStint.seasons.length - 1].season;
      const toFirstSeason = toStint.seasons[0].season;
      tradePromises.push(
        findTradeBetweenStints(playerName, fromStint.teamId, toStint.teamId, fromLastSeason, toFirstSeason)
          .catch(() => null)
          .then(trade => ({
            prevSid: stintNodeId(playerName, fromStint.teamId, i),
            currSid: stintNodeId(playerName, toStint.teamId, i + 1),
            trade,
          }))
      );
    }

    const tradeResults = await Promise.all(tradePromises);
    for (const { prevSid, currSid, trade } of tradeResults) {
      if (trade) {
        const tId = tradeNodeId(trade.id);
        if (!state.nodes.find(n => n.id === tId) && !newNodes.find(n => n.id === tId)) {
          newNodes.push(makeTradeNode(staticTradeToTradeWithDetails(trade)));
        }
        if (!edgeExists(newEdges, prevSid, tId) && !edgeExists(state.edges, prevSid, tId))
          newEdges.push(makeEdge(prevSid, tId));
        if (!edgeExists(newEdges, tId, currSid) && !edgeExists(state.edges, tId, currSid))
          newEdges.push(makeEdge(tId, currSid));
      } else {
        if (!edgeExists(newEdges, prevSid, currSid) && !edgeExists(state.edges, prevSid, currSid))
          newEdges.push(makeEdge(prevSid, currSid));
      }
    }

    // Merge
    const allNodes = [...state.nodes, ...newNodes];
    const allEdges = [...state.edges, ...newEdges];
    const newCore = new Set(state.coreNodes);
    for (const n of newNodes) newCore.add(n.id);

    const newPhases = new Map(ctx.playerPhases);
    newPhases.set(playerName, 'full');

    // Layout
    const laid = layoutPlayerTimeline(allNodes, allEdges, state.playerColumns, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, champNodeId_);

    set({
      nodes: laid,
      edges: allEdges,
      coreNodes: newCore,
      championshipContext: { ...ctx, playerPhases: newPhases },
    });
  },

  // Expand championship web: batch-expand next group of un-expanded player paths
  expandChampionshipWeb: async () => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    // Check if all expanded players are still in 'road' phase — if so, expand them to 'full' first
    const roadPlayers = ctx.players.filter(p =>
      ctx.expandedPaths.has(p.playerName) && ctx.playerPhases.get(p.playerName) === 'road'
      && p.championshipStintIndex < p.allStints.length - 1
    );

    const toExpand = ctx.players.filter(p => !ctx.expandedPaths.has(p.playerName));

    if (toExpand.length > 0) {
      // Expand next batch of 3 un-expanded players (Phase 1)
      const BATCH_SIZE = 3;
      const batch = toExpand.slice(0, BATCH_SIZE);
      for (const player of batch) {
        await get().expandChampionshipPlayer(player.playerName);
      }
    } else if (roadPlayers.length > 0) {
      // All players expanded in Phase 1 — expand all to Phase 2 (show post-championship)
      for (const player of roadPlayers) {
        await get().expandChampionshipPlayerAfter(player.playerName);
      }
    }
  },

  // Inline stats toggle for players in the championship card
  expandInlineChampionshipPlayer: async (nodeId: string, playerName: string) => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    const champNode = state.nodes.find(n => n.id === nodeId);
    if (!champNode || champNode.type !== 'championship') return;

    const currentData = champNode.data as ChampionshipNodeData;
    const currentInline = currentData.inlinePlayers ?? {};

    // Toggle off if already expanded
    if (currentInline[playerName] && !currentInline[playerName].isLoading) {
      const ip = { ...currentInline };
      delete ip[playerName];
      const updatedNodes = state.nodes.map(n =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, inlinePlayers: ip } }
      );
      const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, nodeId);
      set({ nodes: laid });
      return;
    }

    // Set loading state
    const loadingEntry: InlinePlayerData = {
      playerName, teamId: ctx.teamId, stintIndex: 0, seasons: [],
      avgPpg: null, avgRpg: null, avgApg: null, totalWinShares: null,
      accolades: [], isLoading: true,
    };
    const nodesWithLoading = state.nodes.map(n =>
      n.id !== nodeId ? n : { ...n, data: { ...n.data, inlinePlayers: { ...currentInline, [playerName]: loadingEntry } } }
    );
    set({ nodes: nodesWithLoading });

    const playerData = ctx.players.find(p => p.playerName === playerName);
    if (!playerData) return;

    const champStint = playerData.allStints[playerData.championshipStintIndex];
    const stintSeasons = champStint.seasons.map(s => s.season);
    const stintSeasonsSet = new Set(stintSeasons);

    const sb = getSupabase();
    const [allAccolades, allTeamSeasons, allPlayoffGames] = await Promise.all([
      cachedPlayerAccolades(sb, playerName),
      cachedTeamSeasons(sb, ctx.teamId),
      cachedPlayoffGames(sb, playerName),
    ]);

    const accolades = allAccolades.filter(a => a.season && stintSeasonsSet.has(a.season));
    const teamSeasons = allTeamSeasons.filter(ts => stintSeasonsSet.has(ts.season));
    const playoffGames = allPlayoffGames
      .filter(g => g.team_id === ctx.teamId && stintSeasonsSet.has(g.season))
      .sort((a, b) => b.game_score - a.game_score);

    const accoladesByS = new Map<string, string[]>();
    for (const a of accolades) {
      if (!a.season) continue;
      if (!accoladesByS.has(a.season)) accoladesByS.set(a.season, []);
      accoladesByS.get(a.season)!.push(a.accolade);
    }

    const teamSeasonMap = new Map<string, TeamSeason>();
    for (const ts of teamSeasons) teamSeasonMap.set(ts.season, ts);

    // Build playoff peak games and series data
    const peakGamesBySeason = new Map<string, PlayoffPeakGame[]>();
    const seriesBySeason = new Map<string, PlayoffSeries[]>();
    if (playoffGames) {
      const chronological = [...playoffGames].sort((a, b) => a.game_date.localeCompare(b.game_date));
      const seriesMap = new Map<string, { opponentId: string; games: PlayoffSeriesGame[] }>();
      for (const g of chronological) {
        const key = `${g.season}|${g.opponent_id}`;
        if (!seriesMap.has(key)) seriesMap.set(key, { opponentId: g.opponent_id, games: [] });
        const series = seriesMap.get(key)!;
        series.games.push({ gameNumber: series.games.length + 1, gameDate: g.game_date, gameScore: g.game_score, pts: g.pts, trb: g.trb, ast: g.ast, result: g.result, gameMargin: g.game_margin });
      }
      const seriesBySeasonRaw = new Map<string, { key: string; opponentId: string; firstDate: string; games: PlayoffSeriesGame[] }[]>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const arr = seriesBySeasonRaw.get(season) || [];
        arr.push({ key, opponentId: series.opponentId, firstDate: series.games[0]?.gameDate ?? '', games: series.games });
        seriesBySeasonRaw.set(season, arr);
      }
      const roundLookup = new Map<string, number>();
      for (const [season, seriesList] of seriesBySeasonRaw) {
        seriesList.sort((a, b) => a.firstDate.localeCompare(b.firstDate));
        const builtSeries: PlayoffSeries[] = [];
        seriesList.forEach((s, i) => {
          const round = i + 1;
          roundLookup.set(`${season}|${s.opponentId}`, round);
          builtSeries.push({ opponentId: s.opponentId, round, games: s.games });
        });
        seriesBySeason.set(season, builtSeries);
      }
      const gameLookup = new Map<string, { gameNumber: number; round: number }>();
      for (const [key, series] of seriesMap) {
        const season = key.split('|')[0];
        const round = roundLookup.get(`${season}|${series.opponentId}`) ?? 1;
        for (const g of series.games) gameLookup.set(`${g.gameDate}|${series.opponentId}`, { gameNumber: g.gameNumber, round });
      }
      for (const g of playoffGames) {
        if (g.game_score < 20) continue;
        const arr = peakGamesBySeason.get(g.season) || [];
        if (arr.length < 1) {
          const info = gameLookup.get(`${g.game_date}|${g.opponent_id}`);
          arr.push({ gameScore: g.game_score, pts: g.pts, trb: g.trb, ast: g.ast, opponentId: g.opponent_id, gameDate: g.game_date, result: g.result, gameMargin: g.game_margin, gameNumber: info?.gameNumber ?? 0, round: info?.round ?? 1 });
          peakGamesBySeason.set(g.season, arr);
        }
      }
    }

    const allAccoladesList: string[] = [];
    for (const accs of accoladesByS.values()) allAccoladesList.push(...accs);

    const seasonDetails: SeasonDetailRow[] = champStint.seasons.map(ss => ({
      season: ss.season,
      gp: ss.gp,
      ppg: ss.ppg,
      rpg: ss.rpg,
      apg: ss.apg,
      winShares: ss.win_shares,
      teamWins: teamSeasonMap.get(ss.season)?.wins ?? null,
      teamLosses: teamSeasonMap.get(ss.season)?.losses ?? null,
      playoffResult: teamSeasonMap.get(ss.season)?.playoff_result ?? null,
      accolades: accoladesByS.get(ss.season) ?? [],
      salary: null,
      playoffPeakGames: peakGamesBySeason.get(ss.season),
      playoffSeries: seriesBySeason.get(ss.season),
    }));

    const inlineData: InlinePlayerData = {
      playerName,
      teamId: ctx.teamId,
      stintIndex: playerData.championshipStintIndex,
      seasons: stintSeasons,
      avgPpg: avg(champStint.seasons.map(s => s.ppg)),
      avgRpg: avg(champStint.seasons.map(s => s.rpg)),
      avgApg: avg(champStint.seasons.map(s => s.apg)),
      totalWinShares: sum(champStint.seasons.map(s => s.win_shares)),
      accolades: [...new Set(allAccoladesList)],
      seasonDetails,
      isLoading: false,
    };

    const currentState = get();
    const finalNodes = currentState.nodes.map(n => {
      if (n.id !== nodeId) return n;
      const d = n.data as ChampionshipNodeData;
      return { ...n, data: { ...d, inlinePlayers: { ...(d.inlinePlayers ?? {}), [playerName]: inlineData } } };
    });

    const laid = layoutPlayerTimeline(finalNodes, currentState.edges, currentState.playerColumns, currentState.expandedNodes, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections, nodeId);
    set({ nodes: laid });
  },

  // Staged collapse for championship:
  // Stage 1 (any "full" players): revert dissolution stints back to "road" only
  // Stage 2 (any "road" players, no "full"): clear all player paths, leave just the championship card
  // Stage 3 (no expanded paths): collapse the championship card itself
  collapseChampionshipStaged: () => {
    const state = get();
    const ctx = state.championshipContext;
    if (!ctx) return;

    const champNodeId_ = championshipNodeId(ctx.teamId, ctx.season);

    // Check what phase we're in
    const fullPlayers = ctx.players.filter(p => ctx.playerPhases.get(p.playerName) === 'full');
    const hasExpandedPaths = ctx.expandedPaths.size > 0;

    if (fullPlayers.length > 0) {
      // ── Stage 1: Remove post-championship (dissolution) stints, revert "full" → "road" ──
      // Collect node IDs for post-championship stints and their connecting trades
      const nodesToRemove = new Set<string>();
      for (const pd of fullPlayers) {
        const stints = pd.allStints;
        const champIdx = pd.championshipStintIndex;
        // Mark post-champ stint nodes for removal
        for (let i = champIdx + 1; i < stints.length; i++) {
          nodesToRemove.add(stintNodeId(pd.playerName, stints[i].teamId, i));
        }
      }
      // Also remove trade nodes that only connect post-champ stints
      // Find edges that connect to removed nodes — remove those edges, then check if
      // the trade nodes on those edges have any remaining connections
      const removedEdges = state.edges.filter(
        e => nodesToRemove.has(e.source) || nodesToRemove.has(e.target)
      );
      const tradeNodesOnRemovedEdges = new Set<string>();
      for (const e of removedEdges) {
        if (e.source.startsWith('trade-')) tradeNodesOnRemovedEdges.add(e.source);
        if (e.target.startsWith('trade-')) tradeNodesOnRemovedEdges.add(e.target);
      }
      // Only remove trade nodes that have NO remaining edges after the post-champ removal
      const remainingEdges = state.edges.filter(
        e => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
      );
      for (const tId of tradeNodesOnRemovedEdges) {
        const hasRemainingEdge = remainingEdges.some(e => e.source === tId || e.target === tId);
        if (!hasRemainingEdge) nodesToRemove.add(tId);
      }

      const newNodes = state.nodes.filter(n => !nodesToRemove.has(n.id));
      const newEdges = remainingEdges;
      const newExpanded = new Set(state.expandedNodes);
      for (const id of nodesToRemove) newExpanded.delete(id);
      const newCore = new Set(state.coreNodes);
      for (const id of nodesToRemove) newCore.delete(id);

      // Revert all "full" players back to "road"
      const newPhases = new Map(ctx.playerPhases);
      for (const pd of fullPlayers) {
        newPhases.set(pd.playerName, 'road');
      }

      const laid = layoutPlayerTimeline(newNodes, newEdges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, champNodeId_);
      set({
        nodes: laid,
        edges: newEdges,
        expandedNodes: newExpanded,
        coreNodes: newCore,
        championshipContext: { ...ctx, playerPhases: newPhases },
      });
    } else if (hasExpandedPaths) {
      // ── Stage 2: Remove ALL player paths, leave just the championship card ──
      const champNode = state.nodes.find(n => n.id === champNodeId_);
      if (!champNode) return;

      // Strip inline players from championship node
      const champData = champNode.data as ChampionshipNodeData;
      const cleanedChampNode = champData.inlinePlayers
        ? { ...champNode, data: { ...champData, inlinePlayers: undefined } }
        : champNode;

      // Keep only the championship node, remove everything else
      const newEdges: Edge[] = [];
      const newExpanded = new Set<string>();
      newExpanded.add(champNodeId_); // Keep the card expanded so roster is visible

      const laid = layoutPlayerTimeline([cleanedChampNode], newEdges, new Map(), newExpanded, state.expandedGapIds, new Map(), new Map(), champNodeId_);
      set({
        nodes: laid,
        edges: newEdges,
        expandedNodes: newExpanded,
        coreNodes: new Set([champNodeId_]),
        playerColumns: new Map(),
        nextColumnIndex: 0,
        prevColumnIndex: -1,
        championshipContext: {
          ...ctx,
          expandedPaths: new Set<string>(),
          playerPhases: new Map<string, 'road' | 'full'>(),
        },
      });
    } else {
      // ── Stage 3: Collapse the championship card itself ──
      const newExpanded = new Set(state.expandedNodes);
      newExpanded.delete(champNodeId_);

      // Strip inline players from the card
      const newNodes = state.nodes.map(n => {
        if (n.id !== champNodeId_) return n;
        const d = n.data as ChampionshipNodeData;
        if (!d.inlinePlayers) return n;
        const { inlinePlayers: _, ...rest } = d;
        return { ...n, data: rest };
      });

      const laid = layoutPlayerTimeline(newNodes, state.edges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections, champNodeId_);
      set({ nodes: laid, expandedNodes: newExpanded });
    }
  },

  // ── Expand pick node (sync - creates player from became_player_name) ─
  expandPickNode: (nodeId: string) => {
    const state = get();
    if (state.expandedNodes.has(nodeId)) return;

    const pickNode = state.nodes.find((n) => n.id === nodeId);
    if (!pickNode || pickNode.type !== 'pick') return;

    const becamePlayer = (pickNode.data as PickNodeData).becamePlayer;
    if (!becamePlayer) return;

    const pid = playerNodeId(becamePlayer);
    if (state.nodes.find((n) => n.id === pid)) {
      const edgeId = `e-${nodeId}-${pid}`;
      if (!state.edges.find((e) => e.id === edgeId)) {
        set({ edges: [...state.edges, makeEdge(nodeId, pid, 'drafted')] });
      }
      const newExpanded = new Set(state.expandedNodes);
      newExpanded.add(nodeId);
      set({ expandedNodes: newExpanded });
      return;
    }

    const asset = (pickNode.data as PickNodeData).asset;
    const newPlayerNode = makePlayerNode(becamePlayer, asset.to_team_id || asset.original_team_id);
    const newEdge = makeEdge(nodeId, newPlayerNode.id, 'drafted');

    const allNodes = [...state.nodes, newPlayerNode];
    const allEdges = [...state.edges, newEdge];

    layoutGraph(allNodes, allEdges, nodeId, get().expandedNodes).then((laid) => {
      const newExpanded = new Set(get().expandedNodes);
      newExpanded.add(nodeId);
      set({
        nodes: laid,
        edges: allEdges,
        expandedNodes: newExpanded,
      });
    });
  },
}));
