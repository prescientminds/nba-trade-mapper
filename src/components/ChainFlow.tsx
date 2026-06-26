'use client';

/**
 * ChainFlow — read a trade chain as a story: what turned into what, how, and the impact.
 *
 * Trades are nodes laid out left-to-right by degree (one trade deeper per column). The
 * edge between a parent and child is the *asset that moved* (the "how" — the connective
 * tissue), drawn as a ribbon whose thickness is the branch's downstream win shares (the
 * impact). Vertical bands keep each branch in its own lane, so the eye follows one
 * storyline without crossings. Hover a trade to light its path back to the root.
 */

import { useMemo, useState } from 'react';
import type { TradeTreeNode } from '@/lib/chain-hierarchy';

interface Placed {
  node: TradeTreeNode;
  x: number; // left edge of the node bar
  y0: number;
  y1: number;
  parent: TradeTreeNode | null;
}

const NODE_W = 11;
const MARGIN = { top: 26, right: 160, bottom: 12, left: 14 };
const MIN_BAND = 1;

export default function ChainFlow({
  tree,
  width = 1180,
  height = 560,
}: {
  tree: TradeTreeNode;
  width?: number;
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const { placed, maxDepth, colX } = useMemo(() => {
    const placedMap = new Map<string, Placed>();
    const innerTop = MARGIN.top;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    let maxDepth = 0;

    function placeY(node: TradeTreeNode, y0: number, y1: number, parent: TradeTreeNode | null) {
      if (y1 - y0 < MIN_BAND) return;
      maxDepth = Math.max(maxDepth, node.depth);
      placedMap.set(node.tradeId, { node, x: 0, y0, y1, parent });
      if (node.children.length === 0 || node.total <= 0) return;
      let cursor = y0;
      for (const child of node.children) {
        const ch = (child.total / node.total) * (y1 - y0);
        placeY(child, cursor, cursor + ch, node);
        cursor += ch;
      }
    }
    placeY(tree, innerTop, innerTop + innerH, null);

    const plotW = width - MARGIN.left - MARGIN.right;
    const colX = (d: number) => MARGIN.left + (maxDepth === 0 ? 0 : (d / maxDepth) * plotW);
    for (const p of placedMap.values()) p.x = colX(p.node.depth);

    return { placed: placedMap, maxDepth, colX };
  }, [tree, width, height]);

  const litSet = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>();
    let cur: Placed | undefined = placed.get(hovered);
    while (cur) {
      set.add(cur.node.tradeId);
      cur = cur.parent ? placed.get(cur.parent.tradeId) : undefined;
    }
    return set;
  }, [hovered, placed]);

  const nodes = [...placed.values()];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block', fontFamily: 'var(--font-body, system-ui)' }}>
        {/* degree headers */}
        {Array.from({ length: maxDepth + 1 }, (_, d) => (
          <text key={d} x={colX(d)} y={MARGIN.top - 12} fontSize={9} fontWeight={700} letterSpacing={0.5} fill="rgba(255,255,255,0.4)">
            {d === 0 ? 'ROOT' : `DEGREE ${d}`}
          </text>
        ))}

        {/* Edges — the asset that connects each pair, as a weighted ribbon */}
        {nodes.map((p) => {
          if (!p.parent) return null;
          const par = placed.get(p.parent.tradeId);
          if (!par) return null;
          const x1 = par.x + NODE_W;
          const x2 = p.x;
          const lit = !litSet || (litSet.has(p.node.tradeId) && litSet.has(par.node.tradeId));
          const color = p.node.teamColors[0] || '#ff6b35';
          const band = p.y1 - p.y0;
          const cx = (x1 + x2) / 2;
          const showLabel = band >= 11 && p.node.linkAsset;
          // Flat-band ribbon: parent's right edge → child's left edge, spanning the child's band.
          const ribbon = `M${x1},${p.y0} C${cx},${p.y0} ${cx},${p.y0} ${x2},${p.y0} L${x2},${p.y1} C${cx},${p.y1} ${cx},${p.y1} ${x1},${p.y1} Z`;
          return (
            <g key={`e-${p.node.tradeId}`} style={{ pointerEvents: 'none' }}>
              <path d={ribbon} fill={color} fillOpacity={lit ? 0.42 : 0.08} />
              {showLabel && (
                <text
                  x={cx}
                  y={(p.y0 + p.y1) / 2}
                  dy="0.32em"
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="#fff"
                  fillOpacity={lit ? 0.95 : 0.32}
                >
                  {clip(p.node.linkAsset!, Math.max(8, (x2 - x1) / 6.2))}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes — the resulting trade + its impact */}
        {nodes.map((p) => {
          const color = p.node.teamColors[0] || '#ff6b35';
          const lit = !litSet || litSet.has(p.node.tradeId);
          const h = p.y1 - p.y0;
          const showLabel = h >= 13 || p.node.depth === 0;
          return (
            <g
              key={`n-${p.node.tradeId}`}
              onMouseEnter={() => setHovered(p.node.tradeId)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={p.x}
                y={p.y0}
                width={NODE_W}
                height={Math.max(1, h)}
                rx={2}
                fill={color}
                fillOpacity={lit ? 1 : 0.3}
                stroke={p.node.depth === 0 ? '#fff' : 'rgba(0,0,0,0.4)'}
                strokeWidth={p.node.depth === 0 ? 1.5 : 0.5}
              />
              {showLabel && (
                <text
                  x={p.x + NODE_W + 5}
                  y={p.y0 + Math.min(h, 24) / 2}
                  dy="0.32em"
                  fontSize={10}
                  fontWeight={600}
                  fill="#fff"
                  fillOpacity={lit ? 1 : 0.45}
                  style={{ pointerEvents: 'none' }}
                >
                  <tspan opacity={0.6}>{p.node.year} </tspan>
                  {clip(p.node.names[0] || p.node.label, 22)}
                  <tspan dx={5} fontWeight={700} fill="#f9c74f">
                    {p.node.total.toFixed(0)}
                  </tspan>
                </text>
              )}
              <title>
                {p.node.year} {p.node.label} · {p.node.total.toFixed(1)} WS
                {p.node.linkAsset ? `\nconnected via: ${p.node.linkAsset}` : ''}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function clip(s: string, maxChars: number): string {
  const m = Math.max(3, Math.floor(maxChars));
  return s.length > m ? s.slice(0, m - 1) + '…' : s;
}
