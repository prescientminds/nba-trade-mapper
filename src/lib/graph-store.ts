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
import { TEAMS } from './teams';
import { layoutGraph, layoutPlayerTimeline } from './graph-layout';
import { searchStaticTrades, staticTradeToTradeWithDetails, loadSeason, loadTrade, loadSearchIndex } from './trade-data';
import { getDraftInfo } from './draft-data';
import type { StaticTrade } from './supabase';

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
  [key: string]: unknown;
}

export interface TransitionNodeData {
  playerName: string;
  fromTeamId: string;
  toTeamId: string;
  transitionType: 'free-agency' | 'drafted' | 'waived' | 'unknown' | 'traded';
  season: string;
  draftRound?: number;
  draftPick?: number;
  draftYear?: number;
  tradeId?: string;
  tradeDate?: string;
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

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;

  seedFromTrade: (trade: TradeWithDetails) => void;
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
  clearPendingFitTarget: () => void;
  openTradeFromTransition: (tradeId: string, sourceNodeId?: string) => Promise<void>;
  search: (query: string) => Promise<{
    trades: TradeWithDetails[];
    players: string[];
  }>;
}

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

function transitionNodeId(playerName: string, fromTeamId: string, toTeamId: string) {
  return `transition-${playerName.toLowerCase().replace(/\s+/g, '-')}-${fromTeamId}-${toTeamId}`;
}

function gapNodeId(playerName: string, fromYear: number, toYear: number) {
  return `gap-${playerName.toLowerCase().replace(/\s+/g, '-')}-${fromYear}-${toYear}`;
}

function makeTradeNode(trade: TradeWithDetails, position = { x: 0, y: 0 }): Node {
  const teamIds = trade.transaction_teams.map((tt) => tt.team_id);
  const teamColors = teamIds.map((id) => TEAMS[id]?.color || '#666');
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

function makeTransitionNode(
  playerName: string,
  fromTeamId: string,
  toTeamId: string,
  transitionType: TransitionNodeData['transitionType'],
  season: string,
  position = { x: 0, y: 0 }
): Node {
  return {
    id: transitionNodeId(playerName, fromTeamId, toTeamId),
    type: 'transition',
    position,
    data: {
      playerName,
      fromTeamId,
      toTeamId,
      transitionType,
      season,
    } satisfies TransitionNodeData,
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

function makeEdge(source: string, target: string, label?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'straight',
    animated: false,
    label,
    style: { stroke: '#555', strokeWidth: 1.5 },
  };
}

// Helper: check if an edge already exists between source and target
function edgeExists(edges: Edge[], src: string, tgt: string): boolean {
  return edges.some(e => e.source === src && e.target === tgt);
}

// Helper: group consecutive seasons with same team into stints
interface Stint {
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

// ── Find trade between stints ────────────────────────────────────────
async function findTradeBetweenStints(
  playerName: string,
  fromTeamId: string,
  toTeamId: string,
  fromLastSeason: string,
  toFirstSeason: string,
): Promise<StaticTrade | null> {
  // Load both seasons — the trade could be in either
  const seasons = new Set([fromLastSeason, toFirstSeason]);
  const allTrades: StaticTrade[] = [];
  for (const season of seasons) {
    const trades = await loadSeason(season);
    allTrades.push(...trades);
  }

  const nameLower = playerName.toLowerCase();

  // Find trades where this player appears AND both teams are involved.
  // Asset from_team_id/to_team_id in the data don't reliably indicate direction,
  // so we check that the trade involves both teams via the teams array instead.
  const matches = allTrades.filter((t) => {
    const tradeTeamIds = t.teams.map((tm) => tm.team_id);
    if (!tradeTeamIds.includes(fromTeamId) || !tradeTeamIds.includes(toTeamId)) return false;

    // Primary check: player appears in structured assets
    const hasPlayerInAssets = t.assets.some(
      (a) => a.type === 'player' && a.player_name?.toLowerCase() === nameLower
    );
    if (hasPlayerInAssets) return true;

    // Fallback: player name appears in trade description (catches cases where
    // the scraper failed to parse player assets from complex multi-team trades)
    return t.description?.toLowerCase().includes(nameLower) ?? false;
  });

  if (matches.length === 0) return null;

  // Return the best match (prefer the one closest to the transition)
  matches.sort((a, b) => a.date.localeCompare(b.date));
  return matches[matches.length - 1]; // latest matching trade
}

// ── Find all trades involving a name (as player or pick became_player_name) ──
async function findAllTradesForName(name: string): Promise<StaticTrade[]> {
  const index = await loadSearchIndex();
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
    const seasonTrades = await loadSeason(season);
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
): Promise<StaticTrade | null> {
  // Check the first season and the prior season (trade may have happened in offseason)
  const seasonsToCheck = [firstSeason];
  const startYear = parseInt(firstSeason.split('-')[0]);
  if (startYear > 1976) {
    const prevEndStr = (startYear % 100).toString().padStart(2, '0');
    seasonsToCheck.push(`${startYear - 1}-${prevEndStr}`);
  }

  const allTrades: StaticTrade[] = [];
  for (const season of seasonsToCheck) {
    const trades = await loadSeason(season);
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
): Promise<{ trade: StaticTrade; toTeamId: string }[]> {
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
      const trades = await loadSeason(season);
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

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
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
        });
  },

  clearPendingFitTarget: () => set({ pendingFitTarget: null }),

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
    const laid = layoutPlayerTimeline(state.nodes, state.edges, state.playerColumns, state.expandedNodes, newExpandedGaps, state.playerAnchorTrades, state.playerAnchorDirections);
    set({ nodes: laid, expandedGapIds: newExpandedGaps });
  },

  collapseAll: () => {
    const state = get();
    if (state.expandedNodes.size === 0) return;
    // Strip seasonDetails from stint nodes and inlinePlayers from trade nodes
    const updatedNodes = state.nodes.map(n => {
      if (n.type === 'playerStint' && (n.data as PlayerStintNodeData).seasonDetails) {
        const { seasonDetails: _, ...rest } = n.data as PlayerStintNodeData;
        return { ...n, data: rest };
      }
      if (n.type === 'trade' && (n.data as TradeNodeData).inlinePlayers) {
        const { inlinePlayers: _, ...rest } = n.data as TradeNodeData;
        return { ...n, data: rest };
      }
      return n;
    });
    const emptyExpanded = new Set<string>();
    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, emptyExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
      set({ nodes: laid, expandedNodes: emptyExpanded });
    } else {
      layoutGraph(updatedNodes, state.edges, undefined, emptyExpanded).then((laid) => {
        set({ nodes: laid, expandedNodes: emptyExpanded });
      });
    }
  },

  // ── Open trade from transition node click ───────────────────────
  openTradeFromTransition: async (tradeId: string, sourceNodeId?: string) => {
    const trade = await loadTrade(tradeId);
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

    const allEdges = newEdges;

    // Anchor on the source node so the view stays stable
    const laid = await layoutGraph(allNodes, allEdges, sourceNodeId || undefined, state.expandedNodes);
    set({ nodes: laid, edges: allEdges });

    // Auto-expand after a tick
    setTimeout(() => get().expandTradeNode(nodeId), 50);
  },

  // ── Search ───────────────────────────────────────────────────────
  search: async (query: string) => {
    if (query.length < 2) return { trades: [], players: [] };

    // Search static JSON first (covers all historical trades)
    const staticResult = await searchStaticTrades(query);
    const allTrades: TradeWithDetails[] = staticResult.trades.map(staticTradeToTradeWithDetails);
    const uniquePlayers = [...staticResult.players];

    // Also search player_seasons in Supabase for journey data
    const sb = getSupabase();
    const { data: seasonPlayers } = await sb
      .from('player_seasons')
      .select('player_name')
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
    });
    // Auto-expand after a tick
    setTimeout(() => get().expandTradeNode(node.id), 50);
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
      const rootTrade = await loadTrade(tradeId);
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

      const index = await loadSearchIndex();
      const indexMap = new Map(index.map(e => [e.id, e]));
      const fallbackNodes: Node[] = [];
      const fallbackEdges: Edge[] = [];
      for (const tid of coreTradeIds) {
        const entry = indexMap.get(tid);
        if (!entry) continue;
        const seasonTrades = await loadSeason(entry.season);
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
      });
      setTimeout(() => get().expandTradeNode(fallbackNodes[0].id), 50);
      return;
    }

    // 3b. If still no players (e.g. picks-only trade with no chain data), show single trade
    if (valuablePlayers.length === 0) {
      const st = await loadTrade(tradeId);
      if (!st) return;
      const trade = staticTradeToTradeWithDetails(st);
      get().seedFromTrade(trade);
      return;
    }

    // 4. Load root trade from static JSON, create root trade node
    const rootStaticTrade = await loadTrade(tradeId);
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
    const index = await loadSearchIndex();
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
      const seasonTrades = await loadSeason(entry.season);
      const st = seasonTrades.find(t => t.id === tid);
      if (st) staticTradeCache.set(tid, st);
    }

    // Process each player in parallel
    const playerResults = await Promise.all(valuablePlayers.map(async (vp) => {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Fetch seasons + accolades in parallel
      const seasonsPromise = sb.from('player_seasons').select('*')
        .ilike('player_name', vp.name)
        .order('season', { ascending: true }) as unknown as Promise<{ data: PlayerSeason[] | null }>;
      const accoladesPromise = sb.from('player_accolades').select('*')
        .ilike('player_name', vp.name) as unknown as Promise<{ data: PlayerAccolade[] | null }>;
      const [seasonsRes, accoladesRes] = await Promise.all([seasonsPromise, accoladesPromise]);

      const allSeasons = seasonsRes.data;
      const allAccolades = accoladesRes.data;
      if (!allSeasons || allSeasons.length === 0) {
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
    });

    // Auto-expand root trade after a tick
    setTimeout(() => get().expandTradeNode(rootNodeId), 50);
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

    // Collect unique player names from this trade
    const playerNames: string[] = [];
    const seenNames = new Set<string>();
    for (const a of sourceTrade.transaction_assets ?? []) {
      const name = a.asset_type === 'player' ? a.player_name : a.became_player_name;
      if (name && !seenNames.has(name)) {
        seenNames.add(name);
        playerNames.push(name);
      }
    }
    if (playerNames.length === 0) return;

    const sb = getSupabase();

    // Fetch full career data for all players in parallel
    const playerDataResults = await Promise.all(
      playerNames.map(async (name) => {
        const [seasonsRes, accoladesRes] = await Promise.all([
          sb.from('player_seasons').select('*')
            .ilike('player_name', name)
            .order('season', { ascending: true }) as unknown as Promise<{ data: PlayerSeason[] | null }>,
          sb.from('player_accolades').select('*')
            .ilike('player_name', name) as unknown as Promise<{ data: PlayerAccolade[] | null }>,
        ]);
        return { name, seasons: seasonsRes.data, accolades: accoladesRes.data };
      })
    );

    let currentState = get();
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // For each player, figure out where their journey currently ends on
    // the graph and add the next leg
    const nextTradeSearches: { name: string; stintIdx: number; fromTeamId: string; toTeamId: string | null; lastSeason: string; firstSeason: string | null }[] = [];

    for (const { name, seasons, accolades } of playerDataResults) {
      if (!seasons || seasons.length === 0) continue;

      const allStints = groupIntoStints(seasons.filter(s => s.team_id));
      if (allStints.length === 0) continue;

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
        // No stints on graph yet — this is the first expansion
        // Find which stint this trade sends the player to
        const asset = sourceTrade.transaction_assets?.find(
          a => (a.asset_type === 'player' && a.player_name === name) ||
               ((a.asset_type === 'pick' || a.asset_type === 'swap') && a.became_player_name === name)
        );
        const toTeamId = asset?.to_team_id;
        if (!toTeamId) continue;

        let idx = -1;
        for (let i = 0; i < allStints.length; i++) {
          if (allStints[i].teamId === toTeamId) { idx = i; break; }
        }
        // Fallback: first stint after the from team
        if (idx === -1 && asset?.from_team_id) {
          let fromIdx = -1;
          for (let i = 0; i < allStints.length; i++) {
            if (allStints[i].teamId === asset.from_team_id) { fromIdx = i; break; }
          }
          if (fromIdx >= 0 && fromIdx + 1 < allStints.length) idx = fromIdx + 1;
        }
        if (idx === -1) continue;

        stintToAdd = idx;
        edgeFromId = sourceTradeNodeId;
      } else {
        // There's a visible stint — check if the next hop exists
        // We need: last visible stint → trade → next stint
        // Check if there's already a trade edge going out of the last stint
        const lastSid = stintNodeId(name, allStints[lastVisibleStintIdx].teamId, lastVisibleStintIdx);

        // Is there already an outgoing edge from this stint to a trade?
        const hasOutgoingTrade = currentState.edges.some(e =>
          e.source === lastSid && e.target.startsWith('trade-')
        );

        if (hasOutgoingTrade) {
          // Trade node exists after this stint. Find the next stint after it.
          if (lastVisibleStintIdx + 1 >= allStints.length) continue; // no more stints

          // The trade between lastVisibleStintIdx and the next should already be on graph
          // We need to add the next stint and the trade after it
          stintToAdd = lastVisibleStintIdx + 1;

          // Find the trade node between these stints (it should already be on graph)
          const outEdge = currentState.edges.find(e =>
            e.source === lastSid && e.target.startsWith('trade-')
          );
          edgeFromId = outEdge ? outEdge.target : lastSid;
        } else {
          // No outgoing trade yet — need to add the trade between this stint and the next
          const fromStint = allStints[lastVisibleStintIdx];
          const toStint = lastVisibleStintIdx + 1 < allStints.length ? allStints[lastVisibleStintIdx + 1] : null;

          nextTradeSearches.push({
            name,
            stintIdx: lastVisibleStintIdx,
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
        fromTeamId: stint.teamId,
        toTeamId: nextStint?.teamId ?? null,
        lastSeason: stint.seasons[stint.seasons.length - 1].season,
        firstSeason: nextStint?.seasons[0].season ?? null,
      });
    }

    // Find inter-stint trades
    const nextTradeResults = await Promise.all(
      nextTradeSearches.map(async ({ name, stintIdx, fromTeamId, toTeamId, lastSeason, firstSeason }) => {
        let trade: StaticTrade | null = null;
        if (toTeamId && firstSeason) {
          // Normal case: we know both teams
          trade = await findTradeBetweenStints(name, fromTeamId, toTeamId, lastSeason, firstSeason).catch(() => null);
        } else {
          // Last stint case: search all trades for this player after the last season
          const allTrades = await findAllTradesForName(name).catch(() => [] as StaticTrade[]);
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
        return { name, stintIdx, fromTeamId, trade };
      })
    );

    currentState = get();

    for (const { name, stintIdx, fromTeamId, trade } of nextTradeResults) {
      if (!trade) continue;

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
        newAnchorTrades.set(name, sourceTradeNodeId);
        newAnchorDirections.set(name, 'forward');
      }
    }

    const mergedNodes = [...currentState.nodes, ...newNodes];
    const mergedEdges = [...currentState.edges, ...newEdges];
    const cleaned = removeOrphanedNodes(mergedNodes, mergedEdges, currentState.coreNodes);
    const laid = layoutPlayerTimeline(
      cleaned.nodes, cleaned.edges, playerCols,
      currentState.expandedNodes, currentState.expandedGapIds,
      newAnchorTrades, newAnchorDirections
    );

    set({
      nodes: laid,
      edges: cleaned.edges,
      playerColumns: playerCols,
      playerAnchorTrades: newAnchorTrades,
      playerAnchorDirections: newAnchorDirections,
      nextColumnIndex: nextColIdx,
      layoutMode: 'timeline',
      pendingFitTarget: sourceTradeNodeId,
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
      );
      set({ nodes: laid, edges: cleaned.edges, expandedNodes: newExpanded });
    } else {
      set({ nodes: cleaned.nodes, edges: cleaned.edges, expandedNodes: newExpanded });
    }
  },

  // ── Seed from player ─────────────────────────────────────────────
  seedFromPlayer: async (playerName: string) => {
    const sb = getSupabase();

    // Check if we have journey data (player_seasons)
    const { data: seasonCheck } = await sb
      .from('player_seasons')
      .select('player_name')
      .ilike('player_name', playerName)
      .limit(1) as { data: { player_name: string }[] | null };

    if (seasonCheck && seasonCheck.length > 0) {
      // Use journey view: create player node and immediately expand journey
      const node = makePlayerNode(playerName, null, { x: 400, y: 100 }, true);
      set({
        nodes: [node],
        edges: [],
        expandedNodes: new Set(),
        loadingNodes: new Set(),
        coreNodes: new Set([node.id]),
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
      set({ nodes: [node], edges: [], expandedNodes: new Set(), loadingNodes: new Set(), coreNodes: new Set([node.id]) });
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
    });
  },

  // ── Expand player journey ─────────────────────────────────────────
  // Output: PlayerNode → TradeNode → TradeNode → ...
  // No separate stint nodes — stint info is accessible inline within each trade card.
  expandPlayerJourney: async (playerName: string, anchorNodeId?: string) => {
    const sb = getSupabase();

    // Fetch all seasons to determine team boundaries for trade lookup
    const { data: seasons } = await sb
      .from('player_seasons')
      .select('*')
      .ilike('player_name', playerName)
      .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

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
        const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
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

    // Fetch per-season stats
    const { data: seasonStats } = await sb
      .from('player_seasons')
      .select('*')
      .ilike('player_name', playerName)
      .eq('team_id', teamId)
      .in('season', seasons)
      .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

    // Fetch team seasons
    const { data: teamSeasons } = await sb
      .from('team_seasons')
      .select('*')
      .eq('team_id', teamId)
      .in('season', seasons) as { data: TeamSeason[] | null };

    const teamSeasonMap = new Map<string, TeamSeason>();
    if (teamSeasons) {
      for (const ts of teamSeasons) teamSeasonMap.set(ts.season, ts);
    }

    // Fetch accolades
    const { data: accolades } = await sb
      .from('player_accolades')
      .select('*')
      .ilike('player_name', playerName)
      .in('season', seasons) as { data: PlayerAccolade[] | null };

    const accoladesByS = new Map<string, string[]>();
    if (accolades) {
      for (const a of accolades) {
        if (!a.season) continue;
        if (!accoladesByS.has(a.season)) accoladesByS.set(a.season, []);
        accoladesByS.get(a.season)!.push(a.accolade);
      }
    }

    // Fetch contracts
    const { data: contracts } = await sb
      .from('player_contracts')
      .select('*')
      .ilike('player_name', playerName)
      .eq('team_id', teamId)
      .in('season', seasons) as { data: PlayerContract[] | null };

    const contractMap = new Map<string, PlayerContract>();
    if (contracts) {
      for (const c of contracts) contractMap.set(c.season, c);
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
      const laid = layoutPlayerTimeline(updatedNodes, currentState.edges, currentState.playerColumns, newExpanded, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections);
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
    if (!tradeNode || tradeNode.type !== 'trade') return;

    const newExpanded = new Set(state.expandedNodes);
    if (newExpanded.has(nodeId)) {
      // Collapse
      newExpanded.delete(nodeId);
    } else {
      // Expand
      newExpanded.add(nodeId);
    }

    if (state.layoutMode === 'timeline') {
      const laid = layoutPlayerTimeline(state.nodes, state.edges, state.playerColumns, newExpanded, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
      set({ nodes: laid, expandedNodes: newExpanded });
    } else {
      layoutGraph(state.nodes, state.edges, nodeId, newExpanded).then((laid) => {
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

    // Fetch all seasons to find the right stint
    const { data: allSeasons } = await sb
      .from('player_seasons')
      .select('*')
      .ilike('player_name', playerName)
      .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

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

    if (!allSeasons || allSeasons.length === 0) { clearLoading(); return; }

    const stints = groupIntoStints(allSeasons.filter(s => s.team_id));

    // Find first stint at receiving team
    let matchedIdx = -1;
    for (let i = 0; i < stints.length; i++) {
      if (stints[i].teamId === toTeamId) { matchedIdx = i; break; }
    }

    if (matchedIdx === -1) { clearLoading(); return; }

    const stint = stints[matchedIdx];
    const stintSeasons = stint.seasons.map(s => s.season);

    // Fetch accolades and team seasons in parallel
    const [accoladesResult, teamSeasonsResult] = await Promise.all([
      sb.from('player_accolades').select('*').ilike('player_name', playerName).in('season', stintSeasons),
      sb.from('team_seasons').select('*').eq('team_id', toTeamId).in('season', stintSeasons),
    ]);

    const accolades = accoladesResult.data as PlayerAccolade[] | null;
    const teamSeasons = teamSeasonsResult.data as TeamSeason[] | null;

    const accoladesByS = new Map<string, string[]>();
    if (accolades) {
      for (const a of accolades) {
        if (!a.season) continue;
        if (!accoladesByS.has(a.season)) accoladesByS.set(a.season, []);
        accoladesByS.get(a.season)!.push(a.accolade);
      }
    }

    const teamSeasonMap = new Map<string, TeamSeason>();
    if (teamSeasons) for (const ts of teamSeasons) teamSeasonMap.set(ts.season, ts);

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
      salary: null,
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
      const laid = layoutPlayerTimeline(finalNodes, currentState.edges, currentState.playerColumns, currentState.expandedNodes, currentState.expandedGapIds, currentState.playerAnchorTrades, currentState.playerAnchorDirections);
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
      const laid = layoutPlayerTimeline(updatedNodes, state.edges, state.playerColumns, state.expandedNodes, state.expandedGapIds, state.playerAnchorTrades, state.playerAnchorDirections);
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

      // Fetch all seasons to determine stints
      const { data: allSeasons } = await sb
        .from('player_seasons')
        .select('*')
        .ilike('player_name', playerName)
        .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

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
      if (startIdx === -1) return;

      const forwardStints = stints.slice(startIdx);
      const allForwardSeasons = forwardStints.flatMap(s => s.seasons.map(ss => ss.season));

      // Fetch accolades and inter-stint trades in parallel
      const accoladesPromise = Promise.resolve(
        sb
          .from('player_accolades')
          .select('*')
          .ilike('player_name', playerName)
          .in('season', allForwardSeasons)
      ).then(r => r.data as PlayerAccolade[] | null).catch(() => null);

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
      const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections);

      set({
        nodes: laid,
        edges: cleaned.edges,
        playerColumns: playerCols,
        playerAnchorTrades: newAnchorTrades,
        playerAnchorDirections: newAnchorDirections,
        nextColumnIndex: nextColIdx,
        layoutMode: 'timeline',
        pendingFitTarget: tradeNodeId_, // Center on the shared trade so both it and the new column are in view
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

      // Fetch all seasons to determine stints
      const { data: allSeasons } = await sb
        .from('player_seasons')
        .select('*')
        .ilike('player_name', playerName)
        .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

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

      // Fetch accolades and inter-stint trades in parallel
      const accoladesPromise = Promise.resolve(
        sb
          .from('player_accolades')
          .select('*')
          .ilike('player_name', playerName)
          .in('season', allHistoricalSeasons)
      ).then(r => r.data as PlayerAccolade[] | null).catch(() => null);

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
          type: 'straight',
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
      const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections);

      set({
        nodes: laid,
        edges: cleaned.edges,
        playerColumns: playerCols,
        playerAnchorTrades: newAnchorTrades,
        playerAnchorDirections: newAnchorDirections,
        prevColumnIndex: prevColIdx,
        layoutMode: 'timeline',
        pendingFitTarget: tradeNodeId_,
      });
    }
  },

  // ── Expand player full path from trade (combined forward + backward) ──
  // Single-click "Path" replaces both "← Hist" and "Path →".
  // Creates backward stints (before the trade) AND forward stints (after the trade)
  // in one atomic operation, anchored on the trade node as the pivot.
  expandPlayerFullPathFromTrade: async (tradeNodeId_: string, asset: TransactionAsset) => {
    const state = get();

    // Picks with became_player_name: find all trades involving that name and chain them
    if (asset.asset_type === 'pick' || asset.asset_type === 'swap') {
      if (!asset.became_player_name) {
        // No resolved player — fall back to simple pick node
        return get().expandPlayerFromTrade(tradeNodeId_, asset);
      }

      const pickName = asset.became_player_name;
      const allTrades = await findAllTradesForName(pickName);
      const currentTradeId = tradeNodeId_.replace('trade-', '');
      const otherTrades = allTrades.filter(t => t.id !== currentTradeId);

      if (otherTrades.length > 0) {
        // Player was traded elsewhere — show the trade chain
        let newNodes = [...state.nodes];
        let newEdges = [...state.edges];

        const orderedTradeNodeIds: string[] = [];
        for (const trade of allTrades) {
          const tnId = tradeNodeId(trade.id);
          orderedTradeNodeIds.push(tnId);
          if (!newNodes.find(n => n.id === tnId)) {
            const tradeWithDetails = staticTradeToTradeWithDetails(trade);
            const node = makeTradeNode(tradeWithDetails, { x: 0, y: 0 });
            newNodes.push(node);
          }
        }

        for (let i = 0; i < orderedTradeNodeIds.length - 1; i++) {
          const src = orderedTradeNodeIds[i];
          const tgt = orderedTradeNodeIds[i + 1];
          if (!edgeExists(newEdges, src, tgt)) {
            newEdges.push(makeEdge(src, tgt));
          }
        }

        const laid = await layoutGraph(newNodes, newEdges, tradeNodeId_, state.expandedNodes);
        set({
          nodes: laid,
          edges: newEdges,
          pendingFitTarget: tradeNodeId_,
        });

        for (const trade of allTrades) {
          const tnId = tradeNodeId(trade.id);
          if (tnId !== tradeNodeId_ && !state.expandedNodes.has(tnId)) {
            setTimeout(() => get().expandTradeNode(tnId), 100);
          }
        }

        return;
      }
      // Player was only drafted (never traded) — fall through to show career journey
    }

    // Determine player name: from player asset or from pick's became_player_name
    const playerName = asset.player_name ?? asset.became_player_name;
    if (!playerName) return;
    const toTeamId = asset.to_team_id;
    const fromTeamId = asset.from_team_id;
    if (!toTeamId) return;

    // Guard: if forward stints at receiving team already exist, full path was already expanded
    const playerSlug = playerName.toLowerCase().replace(/\s+/g, '-');
    if (state.nodes.some(n => n.id.startsWith(`stint-${playerSlug}-${toTeamId}`))) return;

    const sb = getSupabase();

    // Fetch all seasons ONCE (both old functions fetch independently)
    const { data: allSeasons } = await sb
      .from('player_seasons')
      .select('*')
      .ilike('player_name', playerName)
      .order('season', { ascending: true }) as { data: PlayerSeason[] | null };

    if (!allSeasons || allSeasons.length === 0) return;

    const stints = groupIntoStints(allSeasons.filter(s => s.team_id));
    if (stints.length === 0) return;

    // Find startIdx — first stint at to_team_id (for forward)
    let startIdx = -1;
    for (let i = 0; i < stints.length; i++) {
      if (stints[i].teamId === toTeamId) { startIdx = i; break; }
    }
    // Fallback: player was traded to toTeamId but never played there (immediately re-traded).
    // Use the first stint after the fromTeamId stint instead.
    if (startIdx === -1 && fromTeamId) {
      let fromIdx = -1;
      for (let i = 0; i < stints.length; i++) {
        if (stints[i].teamId === fromTeamId) { fromIdx = i; break; }
      }
      if (fromIdx >= 0 && fromIdx + 1 < stints.length) {
        startIdx = fromIdx + 1;
      }
    }
    if (startIdx === -1) return;

    // Find endIdx — last stint at from_team_id (for backward, only if from_team_id exists)
    let endIdx = -1;
    const hasBackward = !!fromTeamId && fromTeamId !== toTeamId;
    if (hasBackward) {
      for (let i = stints.length - 1; i >= 0; i--) {
        if (stints[i].teamId === fromTeamId) { endIdx = i; break; }
      }
    }
    // If backward stint comes after forward stint, skip backward (data anomaly guard)
    if (endIdx >= startIdx) endIdx = -1;

    const forwardStints = stints.slice(startIdx);
    const backwardStints = endIdx >= 0 ? stints.slice(0, endIdx + 1) : [];

    // Collect ALL seasons for a single accolades query
    const allRelevantSeasons = [
      ...backwardStints.flatMap(s => s.seasons.map(ss => ss.season)),
      ...forwardStints.flatMap(s => s.seasons.map(ss => ss.season)),
    ];

    // Fetch accolades for ALL stint seasons in one query
    const accoladesPromise = Promise.resolve(
      sb
        .from('player_accolades')
        .select('*')
        .ilike('player_name', playerName)
        .in('season', allRelevantSeasons)
    ).then(r => r.data as PlayerAccolade[] | null).catch(() => null);

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
          type: 'straight',
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
    const laid = layoutPlayerTimeline(cleaned.nodes, cleaned.edges, playerCols, currentState.expandedNodes, currentState.expandedGapIds, newAnchorTrades, newAnchorDirections);

    set({
      nodes: laid,
      edges: cleaned.edges,
      playerColumns: playerCols,
      playerAnchorTrades: newAnchorTrades,
      playerAnchorDirections: newAnchorDirections,
      nextColumnIndex: nextColIdx,
      layoutMode: 'timeline',
      pendingFitTarget: tradeNodeId_,
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
