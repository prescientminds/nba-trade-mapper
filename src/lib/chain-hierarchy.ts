/**
 * Chain hierarchy — turns the flat ColumnViewModel into the two shapes the flow
 * visualizations need:
 *   - a strict value-weighted tree (for the icicle / partition), and
 *   - a node+link graph (for d3-sankey).
 *
 * Both are derived from the same chain. Block/ribbon size uses `directScore` — the WS
 * produced AT each trade before its assets were re-traded — because it sums cleanly down
 * the tree. (`score`, the recursive chain total, can exceed a node's parent, which breaks
 * containment in a partition layout.)
 */

import { buildColumnViewModel, type ColumnViewModel } from './column-view';
import { getAnyTeamDisplayInfo } from './teams';
import type { League } from './league';

export interface TradeTreeNode {
  tradeId: string;
  label: string;
  year: string;
  /** Full ISO date, for the year/time-scale axis. */
  date: string | null;
  names: string[];
  teamIds: string[];
  teamColors: string[];
  /** The asset that links this trade to its parent — the connective-tissue mechanism. */
  linkAsset: string | null;
  /** WS produced at this trade only. */
  directValue: number;
  /** directValue + sum of every descendant's directValue. The block/branch weight. */
  total: number;
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
 * (highest-scoring, since childTradeIds is score-sorted) path that reaches it, so the
 * partition stays a clean tree.
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
    const directValue = Math.max(0, node?.directScore ?? 0);
    const total = directValue + children.reduce((s, c) => s + c.total, 0);
    return {
      tradeId,
      label: node?.trade?.title ?? tradeId,
      year,
      date,
      names: node?.assetNames ?? [],
      teamIds: ids,
      teamColors: colors,
      linkAsset,
      directValue,
      total,
      depth,
      children,
    };
  }

  return recurse(model.rootTradeId, 0, null);
}

// ── Sankey shapes ────────────────────────────────────────────────────
export interface SankeyNodeInput {
  id: string;
  label: string;
  year: string;
  names: string[];
  teamColors: string[];
  depth: number;
}
export interface SankeyLinkInput {
  source: number;
  target: number;
  value: number;
}
export interface SankeyGraphInput {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
}

/** Flatten the tree into d3-sankey node/link inputs. Link value = the child branch total. */
export function treeToSankey(root: TradeTreeNode): SankeyGraphInput {
  const nodes: SankeyNodeInput[] = [];
  const links: SankeyLinkInput[] = [];
  const indexOf = new Map<string, number>();

  function addNode(n: TradeTreeNode): number {
    if (indexOf.has(n.tradeId)) return indexOf.get(n.tradeId)!;
    const idx = nodes.length;
    indexOf.set(n.tradeId, idx);
    nodes.push({
      id: n.tradeId,
      label: n.label,
      year: n.year,
      names: n.names,
      teamColors: n.teamColors,
      depth: n.depth,
    });
    return idx;
  }

  function walk(n: TradeTreeNode) {
    const si = addNode(n);
    for (const c of n.children) {
      const ti = addNode(c);
      // d3-sankey requires strictly positive link values.
      links.push({ source: si, target: ti, value: Math.max(c.total, 0.1) });
      walk(c);
    }
  }
  walk(root);
  return { nodes, links };
}

/** One-shot loader: build both shapes for a root trade. Null if the trade has no chain. */
export async function buildChainFlow(
  rootTradeId: string,
  league: League = 'NBA',
): Promise<{ tree: TradeTreeNode; sankey: SankeyGraphInput } | null> {
  const model = await buildColumnViewModel(rootTradeId, league);
  if (!model) return null;
  const tree = buildChainTree(model);
  return { tree, sankey: treeToSankey(tree) };
}
