/**
 * Chain hierarchy — turns the flat ColumnViewModel into a strict value-weighted tree for
 * the ChainFlow view. Each trade is a node; node size and the displayed impact number both
 * use the canonical chain score (the same value the column view + Discovery show).
 */

import { buildColumnViewModel, type ColumnViewModel } from './column-view';
import { getAnyTeamDisplayInfo } from './teams';
import type { League } from './league';

export interface TradeTreeNode {
  tradeId: string;
  label: string;
  year: string;
  /** Full ISO date. */
  date: string | null;
  names: string[];
  teamIds: string[];
  teamColors: string[];
  /** The asset that links this trade to its parent — the connective-tissue mechanism. */
  linkAsset: string | null;
  /** Canonical chain score for this trade (same value the column view + Discovery show).
   *  This is the displayed impact number and the flow's branch weight. */
  score: number;
  depth: number;
  children: TradeTreeNode[];
}

function teamFields(model: ColumnViewModel, tradeId: string): { ids: string[]; colors: string[]; year: string; date: string | null } {
  const trade = model.nodes[tradeId]?.trade;
  const date = trade?.date ?? null;
  const ids = (trade?.teams ?? []).map((t) => t.team_id);
  const colors = ids.map((id) => getAnyTeamDisplayInfo(id, date).color);
  return { ids, colors, year: date ? date.slice(0, 4) : '', date };
}

/**
 * Walk the model into a strict tree rooted at the root trade. A trade can be reached by
 * more than one asset path (the chain is a DAG); we place each trade once, on the first
 * (highest-scoring, since childTradeIds is score-sorted) path that reaches it.
 */
export function buildChainTree(model: ColumnViewModel): TradeTreeNode {
  const visited = new Set<string>();

  function recurse(tradeId: string, depth: number, linkAsset: string | null): TradeTreeNode {
    visited.add(tradeId);
    const node = model.nodes[tradeId];
    const { ids, colors, year, date } = teamFields(model, tradeId);
    const children: TradeTreeNode[] = [];
    for (const childId of node?.childTradeIds ?? []) {
      if (!visited.has(childId) && model.nodes[childId]) {
        const link = model.edgeAssets[`${tradeId}->${childId}`] ?? null;
        children.push(recurse(childId, depth + 1, link));
      }
    }
    return {
      tradeId,
      label: node?.trade?.title ?? tradeId,
      year,
      date,
      names: node?.assetNames ?? [],
      teamIds: ids,
      teamColors: colors,
      linkAsset,
      score: Math.max(0, node?.score ?? 0),
      depth,
      children,
    };
  }

  return recurse(model.rootTradeId, 0, null);
}

/** Load + build the chain tree for a root trade. Null if the trade has no scored chain. */
export async function buildChainFlow(
  rootTradeId: string,
  league: League = 'NBA',
): Promise<{ tree: TradeTreeNode } | null> {
  const model = await buildColumnViewModel(rootTradeId, league);
  if (!model) return null;
  return { tree: buildChainTree(model) };
}
