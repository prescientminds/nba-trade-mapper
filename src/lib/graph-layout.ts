import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';
import type { PlayerStintNodeData, TradeNodeData, PlayerNodeData, GapNodeData, ChampionshipNodeData } from './graph-store';

const elk = new ELK();

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  trade: { width: 180, height: 44 },
  player: { width: 110, height: 30 },
  pick: { width: 100, height: 26 },
  playerStint: { width: 180, height: 36 },
  gap: { width: 180, height: 20 },
  championship: { width: 220, height: 60 },
};

/** Dynamic expanded trade height based on number of assets, teams, and inline player data */
function expandedTradeDimensions(node: Node): { width: number; height: number } {
  const data = node.data as TradeNodeData;
  const assets = data.trade.transaction_assets ?? [];
  // Deduplicate assets
  const seen = new Set<string>();
  let assetCount = 0;
  for (const a of assets) {
    const key = `${a.asset_type}|${a.player_name ?? ''}|${a.pick_year ?? ''}|${a.from_team_id ?? ''}|${a.to_team_id ?? ''}|${a.became_player_name ?? ''}|${a.notes ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      assetCount++;
    }
  }
  const teamCount = new Set(assets.map(a => a.to_team_id).filter(Boolean)).size;
  // Header: date (~10) + heading (~14) + subtitle (~11) + badges (~13) + gaps = ~52
  // Trade score: label (~14) + bars (~16 each) + gap (~6)
  // Separator + margins: ~6
  // Team headers: name wraps at 180px + "Future salary committed" line = ~42 each
  // Asset rows: chevron + name + score + Path button = ~26 each
  // Per-team bottom margins: ~6 each
  // Bottom padding: ~10
  let height = 52 + (20 + teamCount * 16) + 6 + teamCount * 48 + assetCount * 26 + teamCount * 6 + 10;

  // Add height for each inline player panel
  if (data.inlinePlayers) {
    for (const ip of Object.values(data.inlinePlayers)) {
      if (ip.isLoading) {
        height += 24;
      } else {
        const seasonCount = ip.seasonDetails?.length ?? ip.seasons.length;
        // summary stats (16) + table header (16) + rows + padding (6)
        height += 16 + 16 + seasonCount * 16 + 6;
      }
    }
  }

  const hasInlinePlayers = data.inlinePlayers && Object.keys(data.inlinePlayers).length > 0;
  const width = hasInlinePlayers ? 320 : 180;
  return { width, height: Math.max(height, 60) };
}

/** Dynamic expanded championship height based on roster size + inline panels */
function expandedChampionshipDimensions(node: Node): { width: number; height: number } {
  const data = node.data as ChampionshipNodeData;
  const playerCount = data.players?.length ?? 0;
  // Header (~44) + "ROSTER" label (14) + player rows (22 each) + padding
  let height = 44 + 14 + playerCount * 22 + 6;
  // Add height for inline player panels
  if (data.inlinePlayers) {
    for (const ip of Object.values(data.inlinePlayers)) {
      if (ip.isLoading) {
        height += 24;
      } else {
        const seasonCount = ip.seasonDetails?.length ?? ip.seasons.length;
        height += 16 + 16 + seasonCount * 16 + 6;
      }
    }
  }
  const hasInlinePlayers = data.inlinePlayers && Object.keys(data.inlinePlayers).length > 0;
  const width = hasInlinePlayers ? 260 : 220;
  return { width, height: Math.max(height, 60) };
}

/** Dynamic expanded stint height based on number of seasons */
function expandedStintDimensions(node: Node): { width: number; height: number } {
  const data = node.data as PlayerStintNodeData;
  const seasonCount = data.seasonDetails?.length ?? data.seasons?.length ?? 3;
  // Header (~30) + stats line (~14) + table header (~16) + rows + footer (~20)
  const height = 30 + 14 + 16 + seasonCount * 16 + 20;
  return { width: 230, height: Math.max(height, 80) };
}

export function layoutPlayerTimeline(
  nodes: Node[],
  edges: Edge[],
  playerColumns: Map<string, number>,
  expandedNodeIds?: Set<string>,
  expandedGapIds?: Set<string>,
  playerAnchorTrades?: Map<string, string>,
  playerAnchorDirections?: Map<string, 'forward' | 'backward' | 'both'>,
  anchorNodeId?: string,
): Node[] {
  // Record anchor node's position before layout so we can offset to keep it stable
  const anchorBefore = anchorNodeId
    ? nodes.find(n => n.id === anchorNodeId)
    : undefined;
  const anchorPosBefore = anchorBefore
    ? { x: anchorBefore.position.x, y: anchorBefore.position.y }
    : undefined;

  const BASE_YEAR = 1976;
  const PIXELS_PER_YEAR = 10; // compact: topo BFS dominates year-based spacing
  const COLUMN_WIDTH = 210;
  const LEFT_MARGIN = 40;
  const MIN_GAP = 32;
  const GAP_THRESHOLD = 100; // effectively disable gap compression (conflicts with compact layout)

  // Separate gap nodes from regular nodes
  const regularNodes = nodes.filter(n => n.type !== 'gap');
  const gapNodes = nodes.filter(n => n.type === 'gap');

  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]));

  // Build set of anchor trade node IDs (trades that serve as entry points for player columns)
  const anchorTradeNodeIds = new Set(
    playerAnchorTrades ? [...playerAnchorTrades.values()] : []
  );

  // Build adjacency list for trade node centering
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
  }

  function getNodeYear(node: Node): number {
    if (node.type === 'gap') {
      const data = node.data as GapNodeData;
      return (data.fromYear + data.toYear) / 2;
    }
    if (node.type === 'trade') {
      const data = node.data as TradeNodeData;
      const date = data.trade.date ?? '';
      const year = parseInt(date.slice(0, 4));
      return isNaN(year) ? BASE_YEAR : year;
    }
    if (node.type === 'playerStint') {
      const data = node.data as PlayerStintNodeData;
      const firstSeason = data.seasons?.[0] ?? '';
      const year = parseInt(firstSeason.split('-')[0]);
      return isNaN(year) ? BASE_YEAR : year;
    }
    if (node.type === 'player') {
      const data = node.data as PlayerNodeData;
      return data.draftYear ?? BASE_YEAR;
    }
    if (node.type === 'championship') {
      const data = node.data as ChampionshipNodeData;
      const year = parseInt(data.season.split('-')[0]);
      return isNaN(year) ? BASE_YEAR : year;
    }
    return BASE_YEAR;
  }

  function getStintIndex(node: Node): number {
    if (node.type !== 'playerStint') return 0;
    const parts = node.id.split('-');
    const last = parts[parts.length - 1];
    const idx = parseInt(last);
    return isNaN(idx) ? 0 : idx;
  }

  function getPlayerName(node: Node): string | null {
    if (node.type === 'playerStint') return (node.data as PlayerStintNodeData).playerName;
    if (node.type === 'player') return (node.data as PlayerNodeData).name;
    if (node.type === 'gap') return (node.data as GapNodeData).playerName;
    return null;
  }

  function getColumnForNode(node: Node): number {
    const playerName = getPlayerName(node);
    if (playerName && playerColumns.has(playerName)) {
      return playerColumns.get(playerName)!;
    }
    if (node.type === 'championship') {
      // Championship card always stays in its own column to the left of player paths
      return -1;
    }
    if (node.type === 'trade') {
      // Center across all connected player/stint nodes
      const connectedIds = adjacency.get(node.id) ?? [];
      const cols: number[] = [];
      for (const id of connectedIds) {
        const neighbor = nodeMap.get(id);
        if (!neighbor) continue;
        const name = getPlayerName(neighbor);
        if (name && playerColumns.has(name)) {
          cols.push(playerColumns.get(name)!);
        }
      }
      if (cols.length > 0) {
        // Exclude negative (history) columns so a history player doesn't pull
        // the trade node leftward away from the primary player's column.
        const posCols = cols.filter(c => c >= 0);
        const baseCol = posCols.length > 0 ? Math.min(...posCols) : Math.min(...cols);
        // Offset anchor trades one column left so players branch to the right
        if (anchorTradeNodeIds.has(node.id)) {
          return baseCol - 1;
        }
        return baseCol;
      }
    }
    return 0;
  }

  function getNodeHeight(node: Node): number {
    if (node.type === 'gap') return 20;
    if (expandedNodeIds?.has(node.id)) {
      if (node.type === 'trade') return expandedTradeDimensions(node).height;
      if (node.type === 'playerStint') return expandedStintDimensions(node).height;
      if (node.type === 'championship') return expandedChampionshipDimensions(node).height;
    }
    if (node.type === 'championship') return 60;
    if (node.type === 'playerStint') {
      const data = node.data as PlayerStintNodeData;
      let h = 28;
      if (data.draftYear) h += 12;
      if (data.avgPpg !== null) h += 14;
      h += 14; // expand bar
      return h;
    }
    if (node.type === 'trade') return 44;
    if (node.type === 'player') {
      const data = node.data as PlayerNodeData;
      return data.draftYear ? 42 : 30;
    }
    if (node.type === 'pick') return 26;
    return 36;
  }

  // ── Pass 1: compute initial year-based positions for regular nodes ──
  const COLUMN_NODE_WIDTH = 180; // width of trade/stint nodes
  const PLAYER_NODE_WIDTH = 110; // width of player pill nodes
  const initPos = new Map<string, { x: number; y: number; col: number }>();
  for (const node of regularNodes) {
    const year = getNodeYear(node);
    const stintIndex = getStintIndex(node);
    const col = getColumnForNode(node);
    const y = (year - BASE_YEAR) * PIXELS_PER_YEAR + stintIndex * 20;
    // Center player nodes within the column (offset so bottom-center aligns with cards below)
    const x = node.type === 'player'
      ? LEFT_MARGIN + col * COLUMN_WIDTH + (COLUMN_NODE_WIDTH - PLAYER_NODE_WIDTH) / 2
      : LEFT_MARGIN + col * COLUMN_WIDTH;
    initPos.set(node.id, { x, y, col });
  }

  // ── Dense column mapping: collapse empty column gaps ──
  // Collect all logical columns used by regular nodes and gap nodes
  const usedCols = new Set<number>();
  for (const { col } of initPos.values()) {
    usedCols.add(Math.round(col));
  }
  for (const gn of gapNodes) {
    const data = gn.data as GapNodeData;
    const col = playerColumns.has(data.playerName) ? playerColumns.get(data.playerName)! : 0;
    usedCols.add(Math.round(col));
  }
  const sortedCols = [...usedCols].sort((a, b) => a - b);
  const denseColMap = new Map<number, number>();
  for (let i = 0; i < sortedCols.length; i++) {
    denseColMap.set(sortedCols[i], i);
  }

  // Compute per-column widths accounting for expanded trade nodes with inline stats
  const maxDenseCols = sortedCols.length;
  const colWidths = new Array(maxDenseCols).fill(COLUMN_NODE_WIDTH);
  for (const [id, pos] of initPos) {
    const logicalCol = Math.round(pos.col);
    const denseCol = denseColMap.get(logicalCol) ?? logicalCol;
    if (denseCol >= maxDenseCols) continue;
    const node = nodeMap.get(id);
    if (node && expandedNodeIds?.has(node.id) && node.type === 'trade') {
      const w = expandedTradeDimensions(node).width;
      colWidths[denseCol] = Math.max(colWidths[denseCol], w);
    }
    if (node && node.type === 'playerStint') {
      colWidths[denseCol] = Math.max(colWidths[denseCol], 210);
    }
  }
  // Build cumulative x-offsets per dense column
  const COL_GAP = COLUMN_WIDTH - COLUMN_NODE_WIDTH; // spacing between node edges
  const colXOffset = new Array(maxDenseCols).fill(LEFT_MARGIN);
  for (let i = 1; i < maxDenseCols; i++) {
    colXOffset[i] = colXOffset[i - 1] + colWidths[i - 1] + COL_GAP;
  }

  // Remap x-positions in initPos to use dense columns with dynamic widths
  for (const [id, pos] of initPos) {
    const logicalCol = Math.round(pos.col);
    const denseCol = denseColMap.get(logicalCol) ?? logicalCol;
    const node = nodeMap.get(id);
    const baseX = denseCol < maxDenseCols ? colXOffset[denseCol] : LEFT_MARGIN + denseCol * COLUMN_WIDTH;
    const x = node?.type === 'player'
      ? baseX + (COLUMN_NODE_WIDTH - PLAYER_NODE_WIDTH) / 2
      : baseX;
    initPos.set(id, { ...pos, x });
  }

  // ── Pass 1.5: enforce edge ordering (Trade → Stint, etc.) via topological BFS ──
  // Ensures that a node reached via an edge always appears below its predecessor.
  {
    const topoAdj = new Map<string, string[]>();
    const topoInDeg = new Map<string, number>();
    for (const node of regularNodes) {
      topoAdj.set(node.id, []);
      topoInDeg.set(node.id, 0);
    }
    for (const edge of edges) {
      // Skip backward-anchor edges — they connect history stints to the anchor trade
      // but must not participate in the BFS or they push the anchor trade (and all
      // downstream primary / forward stints) further down the canvas.
      if ((edge.data as { excludeFromTopoSort?: boolean } | undefined)?.excludeFromTopoSort) continue;
      if (topoAdj.has(edge.source) && topoAdj.has(edge.target)) {
        topoAdj.get(edge.source)!.push(edge.target);
        topoInDeg.set(edge.target, (topoInDeg.get(edge.target) ?? 0) + 1);
      }
    }
    // Add virtual direct edges through gap nodes so the BFS enforces enough space
    // for the gap node to fit between its regular neighbors.
    const gapBridgeExtra = new Map<string, number>(); // targetId → extra height from gap node
    for (const gapNode of gapNodes) {
      const inEdge = edges.find(e => e.target === gapNode.id);
      const outEdge = edges.find(e => e.source === gapNode.id);
      if (inEdge && outEdge && topoAdj.has(inEdge.source) && topoAdj.has(outEdge.target)) {
        const srcId = inEdge.source;
        const tgtId = outEdge.target;
        if (!topoAdj.get(srcId)!.includes(tgtId)) {
          topoAdj.get(srcId)!.push(tgtId);
          topoInDeg.set(tgtId, (topoInDeg.get(tgtId) ?? 0) + 1);
        }
        // Reserve space: gap node height (24) + extra MIN_GAP below it
        gapBridgeExtra.set(tgtId, getNodeHeight(gapNode) + MIN_GAP);
      }
    }
    const topoQueue: Node[] = regularNodes.filter(n => (topoInDeg.get(n.id) ?? 0) === 0);
    while (topoQueue.length > 0) {
      const src = topoQueue.shift()!;
      const srcPos = initPos.get(src.id);
      if (srcPos) {
        for (const tgtId of topoAdj.get(src.id) ?? []) {
          const extra = gapBridgeExtra.get(tgtId) ?? 0;
          const minNextY = srcPos.y + getNodeHeight(src) + MIN_GAP + extra;
          const tgtPos = initPos.get(tgtId);
          if (tgtPos && tgtPos.y < minNextY) {
            initPos.set(tgtId, { ...tgtPos, y: minNextY });
          }
          const newDeg = (topoInDeg.get(tgtId) ?? 1) - 1;
          topoInDeg.set(tgtId, newDeg);
          if (newDeg === 0) {
            const tgtNode = nodeMap.get(tgtId);
            if (tgtNode && tgtNode.type !== 'gap') topoQueue.push(tgtNode);
          }
        }
      }
    }
  }

  // ── Pass 2: resolve vertical overlaps within each column (regular nodes only) ──
  const byIntCol = new Map<number, Array<{ id: string; y: number; height: number }>>();
  for (const node of regularNodes) {
    const { col } = initPos.get(node.id)!;
    const intCol = Math.round(col);
    if (!byIntCol.has(intCol)) byIntCol.set(intCol, []);
    byIntCol.get(intCol)!.push({
      id: node.id,
      y: initPos.get(node.id)!.y,
      height: getNodeHeight(node),
    });
  }

  const resolvedY = new Map<string, number>();
  for (const items of byIntCol.values()) {
    items.sort((a, b) => a.y - b.y);
    let cursor = -Infinity;
    for (const item of items) {
      const y = Math.max(item.y, cursor);
      resolvedY.set(item.id, y);
      cursor = y + item.height + MIN_GAP;
    }
  }

  // ── Pass 3: apply gap compression to regular nodes ──
  // For each collapsed gap in a column, subtract the savings from all nodes
  // that appear after (at or below) that gap's toYear.
  const gapInfoByCol = new Map<number, Array<{ fromYear: number; toYear: number; isExpanded: boolean }>>();
  for (const gn of gapNodes) {
    const data = gn.data as GapNodeData;
    const col = playerColumns.has(data.playerName) ? playerColumns.get(data.playerName)! : 0;
    const intCol = Math.round(col);
    if (!gapInfoByCol.has(intCol)) gapInfoByCol.set(intCol, []);
    gapInfoByCol.get(intCol)!.push({
      fromYear: data.fromYear,
      toYear: data.toYear,
      isExpanded: expandedGapIds?.has(gn.id) ?? false,
    });
  }

  const compressedY = new Map<string, number>();
  for (const node of regularNodes) {
    const nodeYear = getNodeYear(node);
    const intCol = Math.round(initPos.get(node.id)!.col);
    const gaps = gapInfoByCol.get(intCol) ?? [];

    let savings = 0;
    for (const gap of gaps) {
      if (gap.toYear <= nodeYear && !gap.isExpanded) {
        const savedYears = gap.toYear - gap.fromYear - GAP_THRESHOLD;
        if (savedYears > 0) savings += savedYears * PIXELS_PER_YEAR;
      }
    }

    const baseY = resolvedY.get(node.id) ?? initPos.get(node.id)!.y;
    compressedY.set(node.id, baseY - savings);
  }

  // ── Pass 4: align secondary player columns to their anchor trades ──
  // forward: shift so first post-trade stint lands directly below the anchor.
  // backward: shift so last pre-trade stint lands directly above the anchor.
  // both: split — history nodes go above, forward nodes go below (pivot at anchor Y).
  if (playerAnchorTrades && playerAnchorTrades.size > 0) {
    for (const [anchorPlayerName, anchorTradeId] of playerAnchorTrades) {
      const anchorTradeNodeRef = nodeMap.get(anchorTradeId);
      if (!anchorTradeNodeRef) continue;
      const anchorTradeY = compressedY.get(anchorTradeId);
      if (anchorTradeY === undefined) continue;
      const anchorTradeHeight = getNodeHeight(anchorTradeNodeRef);

      const direction = playerAnchorDirections?.get(anchorPlayerName) ?? 'forward';

      if (direction === 'both') {
        // Find the backward-anchor edge (marked excludeFromTopoSort) to get last history stint
        const lastHistStintId = edges.find(e =>
          e.target === anchorTradeId &&
          (e.data as { excludeFromTopoSort?: boolean } | undefined)?.excludeFromTopoSort &&
          nodeMap.has(e.source) &&
          (nodeMap.get(e.source)!.data as PlayerStintNodeData).playerName === anchorPlayerName
        )?.source;

        // Find the first forward stint connected FROM the anchor trade
        const firstFwdStintId = edges.find(e =>
          e.source === anchorTradeId &&
          nodeMap.has(e.target) &&
          nodeMap.get(e.target)!.type === 'playerStint' &&
          (nodeMap.get(e.target)!.data as PlayerStintNodeData).playerName === anchorPlayerName
        )?.target;

        if (!lastHistStintId && !firstFwdStintId) continue;

        const histOffset = lastHistStintId ? (() => {
          const node = nodeMap.get(lastHistStintId)!;
          const h = getNodeHeight(node);
          const cur = compressedY.get(lastHistStintId);
          if (cur === undefined) return 0;
          return (anchorTradeY - MIN_GAP - h) - cur;
        })() : 0;

        const fwdOffset = firstFwdStintId ? (() => {
          const cur = compressedY.get(firstFwdStintId);
          if (cur === undefined) return 0;
          return (anchorTradeY + anchorTradeHeight + MIN_GAP) - cur;
        })() : 0;

        // Apply per-node: nodes above anchor use history offset, nodes at/below use forward offset
        for (const node of regularNodes) {
          if (getPlayerName(node) !== anchorPlayerName) continue;
          const cur = compressedY.get(node.id);
          if (cur === undefined) continue;
          const off = cur < anchorTradeY ? histOffset : fwdOffset;
          if (Math.abs(off) >= 1) compressedY.set(node.id, cur + off);
        }
      } else {
        let offset: number;

        if (direction === 'forward') {
          // Find the first playerStint connected directly FROM the anchor trade
          const firstStintId = edges.find(e =>
            e.source === anchorTradeId &&
            nodeMap.has(e.target) &&
            nodeMap.get(e.target)!.type === 'playerStint' &&
            (nodeMap.get(e.target)!.data as PlayerStintNodeData).playerName === anchorPlayerName
          )?.target;
          if (!firstStintId) continue;

          const currentFirstStintY = compressedY.get(firstStintId);
          if (currentFirstStintY === undefined) continue;

          const desiredFirstStintY = anchorTradeY + anchorTradeHeight + MIN_GAP;
          offset = desiredFirstStintY - currentFirstStintY;
        } else {
          // backward: find the last history stint via the excluded-from-topo edge
          const lastStintId = edges.find(e =>
            e.target === anchorTradeId &&
            (e.data as { excludeFromTopoSort?: boolean } | undefined)?.excludeFromTopoSort &&
            nodeMap.has(e.source) &&
            (nodeMap.get(e.source)!.data as PlayerStintNodeData).playerName === anchorPlayerName
          )?.source;
          if (!lastStintId) continue;

          const lastStintNode = nodeMap.get(lastStintId)!;
          const lastStintHeight = getNodeHeight(lastStintNode);
          const currentLastStintY = compressedY.get(lastStintId);
          if (currentLastStintY === undefined) continue;

          const desiredLastStintY = anchorTradeY - MIN_GAP - lastStintHeight;
          offset = desiredLastStintY - currentLastStintY;
        }

        if (Math.abs(offset) < 1) continue;

        // Shift all regular nodes belonging to this player
        for (const node of regularNodes) {
          if (getPlayerName(node) !== anchorPlayerName) continue;
          const cur = compressedY.get(node.id);
          if (cur !== undefined) compressedY.set(node.id, cur + offset);
        }
      }
    }
  }

  // ── Pass 5.5: enforce chronological Y order per column ──
  // After anchor alignment (Pass 4), some nodes may violate chronological order
  // across columns (e.g., a 2010 node above a 2005 node). Fix per-column.
  for (const [, items] of byIntCol.entries()) {
    // Re-collect with final Y positions
    const colNodes = items.map(item => ({
      id: item.id,
      year: getNodeYear(nodeMap.get(item.id)!),
      y: compressedY.get(item.id) ?? 0,
      height: item.height,
    }));
    colNodes.sort((a, b) => a.year - b.year || a.y - b.y);
    let cursor = -Infinity;
    for (const cn of colNodes) {
      if (cn.y < cursor) {
        compressedY.set(cn.id, cursor);
        cn.y = cursor;
      }
      cursor = cn.y + cn.height + MIN_GAP;
    }
  }

  // ── Pass 6: cross-column chronological enforcement ──
  // For each node at year Y in column C, push it below the max bottom of nodes
  // in OTHER columns at years < Y. Tracks max bottom per-column so a tall column
  // doesn't inflate its own nodes (only other columns push it down).
  {
    const nodesByYear = new Map<number, Array<{ id: string; height: number; col: number }>>();
    for (const node of regularNodes) {
      const year = getNodeYear(node);
      const col = Math.round(initPos.get(node.id)!.col);
      if (!nodesByYear.has(year)) nodesByYear.set(year, []);
      nodesByYear.get(year)!.push({ id: node.id, height: getNodeHeight(node), col });
    }
    const sortedYears = [...nodesByYear.keys()].sort((a, b) => a - b);

    // Running max bottom per column, updated as we advance through years
    const colMaxBottom = new Map<number, number>();

    for (const year of sortedYears) {
      const nodesForYear = nodesByYear.get(year)!;

      // Push each node below the max bottom of OTHER columns at prior years
      for (const entry of nodesForYear) {
        let crossColMax = -Infinity;
        for (const [col, bot] of colMaxBottom) {
          if (col !== entry.col && bot > crossColMax) {
            crossColMax = bot;
          }
        }
        const curY = compressedY.get(entry.id) ?? 0;
        if (curY < crossColMax) {
          compressedY.set(entry.id, crossColMax);
        }
      }

      // Update per-column max bottoms from this year's final positions
      for (const entry of nodesForYear) {
        const y = compressedY.get(entry.id) ?? 0;
        const bottom = y + entry.height + MIN_GAP;
        const prev = colMaxBottom.get(entry.col) ?? -Infinity;
        if (bottom > prev) colMaxBottom.set(entry.col, bottom);
      }
    }
  }

  // ── Pass 6.5: per-column overlap re-sweep ──
  // Pass 6 may have pushed same-column nodes to the same Y. Re-sweep to fix.
  for (const [, items] of byIntCol.entries()) {
    const colNodes = items.map(item => ({
      id: item.id,
      y: compressedY.get(item.id) ?? 0,
      height: item.height,
    }));
    colNodes.sort((a, b) => a.y - b.y);
    let cursor = -Infinity;
    for (const cn of colNodes) {
      if (cn.y < cursor) {
        compressedY.set(cn.id, cursor);
        cn.y = cursor;
      }
      cursor = cn.y + cn.height + MIN_GAP;
    }
  }

  // ── Pass 5 (moved to end): position gap nodes between their compressed neighbors ──
  // Gap nodes are centered between their neighbors — must run after all Y positions
  // are finalized so gap nodes use correct values.
  const gapPositions = new Map<string, { x: number; y: number }>();
  for (const gn of gapNodes) {
    const data = gn.data as GapNodeData;
    const col = playerColumns.has(data.playerName) ? playerColumns.get(data.playerName)! : 0;
    const intCol = Math.round(col);
    const denseCol = denseColMap.get(intCol) ?? intCol;
    const x = denseCol < maxDenseCols ? colXOffset[denseCol] : LEFT_MARGIN + denseCol * COLUMN_WIDTH;

    // Find neighboring nodes via edges
    const prevEdge = edges.find(e => e.target === gn.id);
    const nextEdge = edges.find(e => e.source === gn.id);
    const prevNodeId = prevEdge?.source;
    const nextNodeId = nextEdge?.target;

    const prevNode = prevNodeId ? nodeMap.get(prevNodeId) : undefined;
    const prevY = prevNodeId ? (compressedY.get(prevNodeId) ?? 0) : 0;
    const prevHeight = prevNode ? getNodeHeight(prevNode) : 36;
    const nextY = nextNodeId ? (compressedY.get(nextNodeId) ?? prevY + 240) : prevY + 240;

    // Center the gap node in the space between prevNode bottom and nextNode top
    const spaceTop = prevY + prevHeight + MIN_GAP;
    const spaceBottom = nextY - MIN_GAP;
    const y = (spaceTop + spaceBottom) / 2 - 12; // 12 = half of gap node height

    gapPositions.set(gn.id, { x, y });
  }

  // ── Return all nodes with final positions ──
  const result = nodes.map(node => {
    if (node.type === 'gap') {
      return { ...node, position: gapPositions.get(node.id) ?? node.position };
    }
    const pos = initPos.get(node.id);
    if (!pos) return node;
    const y = compressedY.get(node.id) ?? (resolvedY.get(node.id) ?? pos.y);
    return { ...node, position: { x: pos.x, y } };
  });

  // Apply anchor offset to keep the anchor node at its original position
  if (anchorNodeId && anchorPosBefore) {
    const anchorAfter = result.find(n => n.id === anchorNodeId)?.position;
    if (anchorAfter) {
      const dx = anchorPosBefore.x - anchorAfter.x;
      const dy = anchorPosBefore.y - anchorAfter.y;
      if (dx !== 0 || dy !== 0) {
        return result.map(n => ({
          ...n,
          position: { x: n.position.x + dx, y: n.position.y + dy },
        }));
      }
    }
  }

  return result;
}

export async function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  anchorNodeId?: string,
  expandedNodeIds?: Set<string>
): Promise<Node[]> {
  if (nodes.length === 0) return nodes;

  const anchorBefore = anchorNodeId
    ? nodes.find((n) => n.id === anchorNodeId)
    : undefined;
  const anchorPosBefore = anchorBefore
    ? { x: anchorBefore.position.x, y: anchorBefore.position.y }
    : undefined;

  const elkNodes: ElkNode[] = nodes.map((node) => {
    // Expanded stint
    const isExpandedStint = expandedNodeIds?.has(node.id) && node.type === 'playerStint';
    if (isExpandedStint) {
      const dims = expandedStintDimensions(node);
      return { id: node.id, ...dims };
    }

    // Expanded trade
    const isExpandedTrade = expandedNodeIds?.has(node.id) && node.type === 'trade';
    if (isExpandedTrade) {
      const dims = expandedTradeDimensions(node);
      return { id: node.id, ...dims };
    }

    // Stint nodes: stats line + expand bar always visible now
    if (node.type === 'playerStint') {
      const data = node.data as PlayerStintNodeData;
      const hasArrival = data.draftYear;
      const hasStats = data.avgPpg !== null;
      let height = 28;
      if (hasArrival) height += 12;
      if (hasStats) height += 14;
      height += 14; // expand bar
      return { id: node.id, width: 210, height };
    }

    if (node.type === 'player') {
      const data = node.data as PlayerNodeData;
      return { id: node.id, width: 120, height: data.draftYear ? 42 : 30 };
    }

    const dims = NODE_DIMENSIONS[node.type || 'trade'] || NODE_DIMENSIONS.trade;
    return { id: node.id, width: dims.width, height: dims.height };
  });

  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }));

  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '30',
      'elk.layered.spacing.nodeNodeBetweenLayers': '40',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: elkNodes,
    edges: elkEdges,
  });

  const positionMap = new Map<string, { x: number; y: number }>();
  for (const child of graph.children || []) {
    positionMap.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  // Compute offset to keep anchor node in place
  let offsetX = 0;
  let offsetY = 0;
  if (anchorNodeId && anchorPosBefore) {
    const anchorAfter = positionMap.get(anchorNodeId);
    if (anchorAfter) {
      offsetX = anchorPosBefore.x - anchorAfter.x;
      offsetY = anchorPosBefore.y - anchorAfter.y;
    }
  }

  return nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: { x: pos.x + offsetX, y: pos.y + offsetY },
    };
  });
}

/**
 * Universal overlap resolver — the "Excel rows" guarantee.
 * After any node changes size, call this with the current nodes array.
 * Uses React Flow's measured dimensions (actual DOM) when available,
 * falls back to static defaults. Returns null if no adjustment needed.
 */
export function resolveNodeOverlaps(nodes: Node[]): Node[] | null {
  if (nodes.length < 2) return null;

  const MIN_GAP = 20;
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  let changed = false;

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    const h = node.measured?.height ?? (NODE_DIMENSIONS[node.type || 'trade']?.height ?? 44);
    const w = node.measured?.width ?? (NODE_DIMENSIONS[node.type || 'trade']?.width ?? 180);
    const bottom = node.position.y + h;

    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      const ow = other.measured?.width ?? (NODE_DIMENSIONS[other.type || 'trade']?.width ?? 180);

      // Skip nodes with no horizontal overlap (different columns)
      if (node.position.x + w <= other.position.x || other.position.x + ow <= node.position.x) continue;

      // First horizontally-overlapping node below — check vertical gap
      if (bottom + MIN_GAP > other.position.y) {
        const shift = bottom + MIN_GAP - other.position.y;
        // Push this node and everything below it down
        for (let k = j; k < sorted.length; k++) {
          sorted[k] = {
            ...sorted[k],
            position: { ...sorted[k].position, y: sorted[k].position.y + shift },
          };
        }
        changed = true;
      }
      break; // Only need the first horizontal match — further nodes are even lower
    }
  }

  return changed ? sorted : null;
}
