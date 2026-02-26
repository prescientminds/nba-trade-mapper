/**
 * Static JSON trade data loader.
 *
 * Historical trades are stored as static JSON files:
 *   NBA:  public/data/trades/
 *   WNBA: public/data/wnba/trades/
 *
 * This module loads, caches, and searches them — no Supabase needed for trade lookups.
 */

import type {
  StaticTrade,
  TradeSearchIndexEntry,
  TradeWithDetails,
  TransactionAsset,
  TransactionTeam,
} from './supabase';
import type { League } from './league';
import { tradeDataBasePath } from './league';

// ── Cache (keyed by league) ──────────────────────────────────────────
const seasonCache = new Map<string, StaticTrade[]>();
const searchIndexCache = new Map<League, TradeSearchIndexEntry[]>();

function seasonCacheKey(league: League, season: string): string {
  return `${league}:${season}`;
}

// ── Loaders ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
}

export async function loadSearchIndex(league: League = 'NBA'): Promise<TradeSearchIndexEntry[]> {
  if (searchIndexCache.has(league)) return searchIndexCache.get(league)!;
  const base = tradeDataBasePath(league);
  const index = await fetchJson<TradeSearchIndexEntry[]>(`${base}/index.json`);
  searchIndexCache.set(league, index);
  return index;
}

export async function loadSeason(season: string, league: League = 'NBA'): Promise<StaticTrade[]> {
  const key = seasonCacheKey(league, season);
  if (seasonCache.has(key)) return seasonCache.get(key)!;
  try {
    const base = tradeDataBasePath(league);
    const trades = await fetchJson<StaticTrade[]>(`${base}/by-season/${season}.json`);
    seasonCache.set(key, trades);
    return trades;
  } catch {
    seasonCache.set(key, []);
    return [];
  }
}

export async function loadTrade(tradeId: string, league: League = 'NBA'): Promise<StaticTrade | null> {
  const index = await loadSearchIndex(league);
  const entry = index.find((e) => e.id === tradeId);
  if (!entry) return null;

  const trades = await loadSeason(entry.season, league);
  return trades.find((t) => t.id === tradeId) || null;
}

// ── Search ───────────────────────────────────────────────────────────

export async function searchStaticTrades(query: string, league: League = 'NBA'): Promise<{
  trades: StaticTrade[];
  players: string[];
}> {
  if (query.length < 2) return { trades: [], players: [] };

  const index = await loadSearchIndex(league);
  const q = query.toLowerCase();

  // Find matching index entries
  const matchingEntries: TradeSearchIndexEntry[] = [];
  const matchingPlayers = new Set<string>();

  for (const entry of index) {
    const titleMatch = entry.title.toLowerCase().includes(q);
    const playerMatch = entry.players.some((p) => p.toLowerCase().includes(q));
    const teamMatch = entry.teams.some((t) => t.toLowerCase().includes(q));

    if (titleMatch || playerMatch || teamMatch) {
      matchingEntries.push(entry);
    }

    if (playerMatch) {
      for (const p of entry.players) {
        if (p.toLowerCase().includes(q)) matchingPlayers.add(p);
      }
    }
  }

  // Sort by date descending, limit to 12
  matchingEntries.sort((a, b) => b.date.localeCompare(a.date));
  const topEntries = matchingEntries.slice(0, 12);

  // Load full trade objects for matches
  const seasonGroups = new Map<string, string[]>();
  for (const entry of topEntries) {
    if (!seasonGroups.has(entry.season)) seasonGroups.set(entry.season, []);
    seasonGroups.get(entry.season)!.push(entry.id);
  }

  const trades: StaticTrade[] = [];
  for (const [season, ids] of seasonGroups) {
    const seasonTrades = await loadSeason(season, league);
    for (const id of ids) {
      const t = seasonTrades.find((st) => st.id === id);
      if (t) trades.push(t);
    }
  }

  // Sort trades by date descending
  trades.sort((a, b) => b.date.localeCompare(a.date));

  return {
    trades: trades.slice(0, 12),
    players: [...matchingPlayers].slice(0, 8),
  };
}

// ── Find all trades for a specific player ───────────────────────────

export async function findTradesForPlayer(playerName: string, league: League = 'NBA'): Promise<StaticTrade[]> {
  const index = await loadSearchIndex(league);
  const lowerName = playerName.toLowerCase();

  // Find all index entries where this player appears (exact match)
  const matching = index.filter(entry =>
    entry.players.some(p => p.toLowerCase() === lowerName)
  );

  // Load full trade objects grouped by season
  const seasonGroups = new Map<string, string[]>();
  for (const entry of matching) {
    if (!seasonGroups.has(entry.season)) seasonGroups.set(entry.season, []);
    seasonGroups.get(entry.season)!.push(entry.id);
  }

  const trades: StaticTrade[] = [];
  for (const [season, ids] of seasonGroups) {
    const seasonTrades = await loadSeason(season, league);
    for (const id of ids) {
      const t = seasonTrades.find(st => st.id === id);
      if (t) trades.push(t);
    }
  }

  // Sort by date descending (most recent first)
  trades.sort((a, b) => b.date.localeCompare(a.date));

  return trades;
}

// ── Conversion: StaticTrade → TradeWithDetails ───────────────────────
// Allows the existing graph-store to work with static trades seamlessly.

export function staticTradeToTradeWithDetails(st: StaticTrade): TradeWithDetails {
  const transaction_teams: TransactionTeam[] = st.teams.map((t, i) => ({
    id: `${st.id}-team-${i}`,
    transaction_id: st.id,
    team_id: t.team_id,
    role: t.role,
  }));

  const transaction_assets: TransactionAsset[] = st.assets.map((a, i) => ({
    id: `${st.id}-asset-${i}`,
    transaction_id: st.id,
    asset_type: a.type,
    player_name: a.player_name,
    pick_year: a.pick_year,
    pick_round: a.pick_round,
    original_team_id: a.original_team_id,
    from_team_id: a.from_team_id,
    to_team_id: a.to_team_id,
    became_player_name: a.became_player_name,
    status: null,
    notes: a.notes,
  }));

  return {
    id: st.id,
    date: st.date,
    type: 'trade',
    title: st.title,
    description: st.description,
    season: st.season,
    significance: '',
    root_transaction_id: null,
    parent_transaction_id: null,
    generation: 0,
    is_multi_team: st.is_multi_team,
    group_id: null,
    transaction_teams,
    transaction_assets,
  };
}
