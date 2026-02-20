/**
 * Static JSON trade data loader.
 *
 * Historical trades are stored as static JSON files in public/data/trades/.
 * This module loads, caches, and searches them — no Supabase needed for trade lookups.
 */

import type {
  StaticTrade,
  TradeSearchIndexEntry,
  TradeWithDetails,
  TransactionAsset,
  TransactionTeam,
} from './supabase';

// ── Cache ────────────────────────────────────────────────────────────
const seasonCache = new Map<string, StaticTrade[]>();
let searchIndex: TradeSearchIndexEntry[] | null = null;

// ── Loaders ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  return resp.json();
}

export async function loadSearchIndex(): Promise<TradeSearchIndexEntry[]> {
  if (searchIndex) return searchIndex;
  searchIndex = await fetchJson<TradeSearchIndexEntry[]>('/data/trades/index.json');
  return searchIndex;
}

export async function loadSeason(season: string): Promise<StaticTrade[]> {
  if (seasonCache.has(season)) return seasonCache.get(season)!;
  try {
    const trades = await fetchJson<StaticTrade[]>(`/data/trades/by-season/${season}.json`);
    seasonCache.set(season, trades);
    return trades;
  } catch {
    seasonCache.set(season, []);
    return [];
  }
}

export async function loadTrade(tradeId: string): Promise<StaticTrade | null> {
  const index = await loadSearchIndex();
  const entry = index.find((e) => e.id === tradeId);
  if (!entry) return null;

  const trades = await loadSeason(entry.season);
  return trades.find((t) => t.id === tradeId) || null;
}

// ── Search ───────────────────────────────────────────────────────────

export async function searchStaticTrades(query: string): Promise<{
  trades: StaticTrade[];
  players: string[];
}> {
  if (query.length < 2) return { trades: [], players: [] };

  const index = await loadSearchIndex();
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
    const seasonTrades = await loadSeason(season);
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
