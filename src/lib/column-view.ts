/**
 * Column View data layer.
 *
 * Builds a Finder-style, depth-ranked model of a trade chain: column N holds the
 * trades at BFS depth N from a root trade. The chain's `exit_trade_id` + nested
 * `children` (already computed by compute-chain-scores.ts and stored in Supabase
 * `trade_chain_scores.chain_scores`) encode the trade→trade edges, so we walk that
 * tree rather than re-deriving the BFS.
 *
 * Edge scope (locked 2026-06-24): trade→trade only. Players/picks are row content,
 * never their own columns. Sort metric: summed chain win-shares of the assets
 * received in a trade — "biggest-consequence branch first."
 */

import { getSupabase } from './supabase';
import { loadTrade } from './trade-data';
import type { ChainAsset, ChainTeamData } from './graph-store';
import type { StaticTrade } from './supabase';
import type { League } from './league';

/** One trade as it appears in a column. */
export interface ColumnTradeNode {
  tradeId: string;
  /** Loaded summary (date/title/teams). Null if the trade isn't in the static JSON. */
  trade: StaticTrade | null;
  /** Summed chain WS of the assets received in this trade. Sort key within a column. */
  score: number;
  /** Summed *direct* WS (production at this trade only, before re-trades). Sums cleanly
   *  down the tree, so it's the value used for partition/icicle block sizing. */
  directScore: number;
  /** Significant players/picks received in this trade (deduped, score-ordered). */
  assetNames: string[];
  /** Immediate downstream trades, score-sorted. Populating the next column. */
  childTradeIds: string[];
}

export interface ColumnViewModel {
  rootTradeId: string;
  /** Every reachable trade in the chain, keyed by id. */
  nodes: Record<string, ColumnTradeNode>;
}

/** Filter the non-player junk that leaks into chain data (mirrors chain-utils). */
function isRealPlayerName(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes('trade exception')) return false;
  if (lower.includes('pick') && (lower.includes('if') || lower.includes('unless'))) return false;
  if (lower.includes('2nd-round') || lower.includes('000')) return false;
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  if (/^[0-9(]/.test(name)) return false;
  return true;
}

/** Fetch the chain-score tree for a root trade from Supabase. Null if unscored. */
export async function fetchChainScores(
  tradeId: string,
): Promise<Record<string, ChainTeamData> | null> {
  const { data } = await getSupabase()
    .from('trade_chain_scores')
    .select('chain_scores')
    .eq('trade_id', tradeId)
    .single();
  const scores = (data as { chain_scores?: Record<string, ChainTeamData> } | null)?.chain_scores;
  return scores && Object.keys(scores).length > 0 ? scores : null;
}

/**
 * Walk the per-team chain trees into a flat trade graph. Each asset was *received*
 * in `currentTradeId`; if it carries an `exit_trade_id` it was later flipped, which
 * is the edge to a downstream trade.
 */
function buildGraph(
  rootTradeId: string,
  chainScores: Record<string, ChainTeamData>,
): Record<string, ColumnTradeNode> {
  const nodes: Record<string, ColumnTradeNode> = {};
  const seenNames: Record<string, Set<string>> = {};

  function ensure(id: string): ColumnTradeNode {
    if (!nodes[id]) {
      nodes[id] = { tradeId: id, trade: null, score: 0, directScore: 0, assetNames: [], childTradeIds: [] };
      seenNames[id] = new Set();
    }
    return nodes[id];
  }
  ensure(rootTradeId);

  // Guard against cyclic exit_trade_id references (defensive — compute caps depth at 12).
  function walk(assets: ChainAsset[], currentTradeId: string, depth: number) {
    if (depth > 24) return;
    const cur = ensure(currentTradeId);
    for (const a of assets) {
      const isAsset = a.type === 'player' || a.type === 'pick';
      if (isAsset && a.direct > 0) {
        cur.directScore += a.direct;
      }
      if (isAsset && a.chain > 0) {
        cur.score += a.chain;
        if (isRealPlayerName(a.name) && !seenNames[currentTradeId].has(a.name)) {
          seenNames[currentTradeId].add(a.name);
          cur.assetNames.push(a.name);
        }
      }
      if (a.exit_trade_id) {
        const childId = a.exit_trade_id;
        const child = ensure(childId);
        if (!cur.childTradeIds.includes(childId) && childId !== currentTradeId) {
          cur.childTradeIds.push(childId);
        }
        if (a.children && a.children.length > 0) {
          walk(a.children, childId, depth + 1);
        } else {
          void child; // child trade exists even with no further-traced assets
        }
      }
    }
  }

  for (const team of Object.values(chainScores)) {
    walk(team.assets, rootTradeId, 0);
  }

  // Score-sort each node's assets and children so columns render best-first.
  for (const node of Object.values(nodes)) {
    node.childTradeIds.sort((x, y) => (nodes[y]?.score ?? 0) - (nodes[x]?.score ?? 0));
  }
  return nodes;
}

/**
 * Build the full Column View model for a root trade. Fetches chain scores, walks the
 * tree, and hydrates each reachable trade's summary. Returns null if the trade has no
 * chain data (it was never scored, e.g. a leaf or pre-2019 unscored trade).
 */
export async function buildColumnViewModel(
  rootTradeId: string,
  league: League = 'NBA',
): Promise<ColumnViewModel | null> {
  const chainScores = await fetchChainScores(rootTradeId);
  if (!chainScores) return null;

  const nodes = buildGraph(rootTradeId, chainScores);

  // Hydrate trade summaries for every reachable trade (chains are bounded — a handful).
  const ids = Object.keys(nodes);
  const trades = await Promise.all(ids.map((id) => loadTrade(id, league).catch(() => null)));
  ids.forEach((id, i) => {
    nodes[id].trade = trades[i];
  });

  return { rootTradeId, nodes };
}

/** Resolve a column's trade ids to nodes, score-sorted, skipping any that vanished. */
export function columnNodes(
  model: ColumnViewModel,
  tradeIds: string[],
): ColumnTradeNode[] {
  return tradeIds
    .map((id) => model.nodes[id])
    .filter((n): n is ColumnTradeNode => !!n)
    .sort((a, b) => b.score - a.score);
}
