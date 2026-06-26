'use client';

/**
 * ChainFlow — the trade chain as a node-link flow.
 *
 * Trades are nodes; the edge between a parent and child trade is the *asset that moved*
 * (the connective-tissue mechanism), drawn as a weighted ribbon whose thickness is the
 * branch's downstream win shares. Vertical bands keep each branch in its own lane, so
 * lineage reads without crossings in degree mode.
 *
 * The x-axis toggles:
 *   - "By degree" — evenly spaced columns, one trade deeper per step (BFS depth).
 *   - "By year"   — trades positioned on a real calendar axis, so a long horizontal jump
 *                   means an asset sat for years before it was re-traded.
 */

import { useMemo, useState } from 'react';
import type { TradeTreeNode } from '@/lib/chain-hierarchy';

type Mode = 'degree' | 'year';

interface Placed {
  node: TradeTreeNode;
  x: number; // left edge of the node bar
  y0: number;
  y1: number;
  parent: TradeTreeNode | null;
}

const NODE_W = 11;
const MARGIN = { top: 28, right: 150, bottom: 24, left: 12 };
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
  const [mode, setMode] = useState<Mode>('degree');
  const [hovered, setHovered] = useState<string | null>(null);

  const { placed, maxDepth, years, plotW } = useMemo(() => {
    const placedMap = new Map<string, Placed>();
    const innerTop = MARGIN.top;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    let maxDepth = 0;
    let minT = Infinity;
    let maxT = -Infinity;

    // Vertical bands: each node spans [y0,y1] ∝ its branch total within its parent's band.
    function placeY(node: TradeTreeNode, y0: number, y1: number, parent: TradeTreeNode | null) {
      if (y1 - y0 < MIN_BAND) return;
      maxDepth = Math.max(maxDepth, node.depth);
      const t = node.date ? Date.parse(node.date) : NaN;
      if (!Number.isNaN(t)) {
        minT = Math.min(minT, t);
        maxT = Math.max(maxT, t);
      }
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
    const span = maxT - minT || 1;
    for (const p of placedMap.values()) {
      if (mode === 'degree') {
        p.x = MARGIN.left + (maxDepth === 0 ? 0 : (p.node.depth / maxDepth) * plotW);
      } else {
        const t = p.node.date ? Date.parse(p.node.date) : minT;
        p.x = MARGIN.left + ((t - minT) / span) * plotW;
      }
    }

    // Year ticks for the time axis.
    const years: { year: number; x: number }[] = [];
    if (Number.isFinite(minT) && Number.isFinite(maxT)) {
      const y0 = new Date(minT).getFullYear();
      const y1 = new Date(maxT).getFullYear();
      for (let y = y0; y <= y1; y++) {
        const t = Date.parse(`${y}-01-01`);
        years.push({ year: y, x: MARGIN.left + ((t - minT) / span) * plotW });
      }
    }

    return { placed: placedMap, maxDepth, years, plotW };
  }, [tree, width, height, mode]);

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
    <div>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {(['degree', 'year'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: 'pointer',
              background: mode === m ? '#ff6b35' : 'transparent',
              color: mode === m ? '#fff' : 'rgba(255,255,255,0.6)',
            }}
          >
            {m === 'degree' ? 'By degree' : 'By year'}
          </button>
        ))}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
          ribbon = the asset that moved · thickness = downstream win shares
        </span>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg width={width} height={height} style={{ display: 'block', fontFamily: 'var(--font-body, system-ui)' }}>
          {/* Year gridlines (time mode only) */}
          {mode === 'year' &&
            years.map((y) => (
              <g key={y.year}>
                <line x1={y.x} y1={MARGIN.top - 6} x2={y.x} y2={height - MARGIN.bottom} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
                <text x={y.x + 2} y={height - MARGIN.bottom + 14} fontSize={9} fill="rgba(255,255,255,0.35)">
                  {y.year}
                </text>
              </g>
            ))}
          {mode === 'degree' &&
            Array.from({ length: maxDepth + 1 }, (_, d) => {
              const x = MARGIN.left + (maxDepth === 0 ? 0 : (d / maxDepth) * plotW);
              return (
                <text key={d} x={x} y={MARGIN.top - 14} fontSize={9} fontWeight={700} fill="rgba(255,255,255,0.4)">
                  {d === 0 ? 'ROOT' : `DEG ${d}`}
                </text>
              );
            })}

          {/* Edges — the connecting asset, as a weighted ribbon */}
          {nodes.map((p) => {
            if (!p.parent) return null;
            const par = placed.get(p.parent.tradeId);
            if (!par) return null;
            const x1 = par.x + NODE_W;
            const x2 = p.x;
            const lit = !litSet || (litSet.has(p.node.tradeId) && litSet.has(par.node.tradeId));
            const color = p.node.teamColors[0] || '#ff6b35';
            const band = p.y1 - p.y0;
            const midX = (x1 + x2) / 2;
            const showLabel = band >= 12 && p.node.linkAsset;
            // Smooth ribbon: cubic between the parent's right edge and the child's left edge,
            // both at the child's band [y0,y1].
            const cx = (x1 + x2) / 2;
            const d = `M${x1},${p.y0} C${cx},${p.y0} ${cx},${p.y0} ${x2},${p.y0} L${x2},${p.y1} C${cx},${p.y1} ${cx},${p.y1} ${x1},${p.y1} Z`;
            return (
              <g key={`e-${p.node.tradeId}`} style={{ pointerEvents: 'none' }}>
                <path d={d} fill={color} fillOpacity={lit ? 0.4 : 0.08} />
                {showLabel && (
                  <text
                    x={midX}
                    y={(p.y0 + p.y1) / 2}
                    dy="0.32em"
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={600}
                    fill="#fff"
                    fillOpacity={lit ? 0.92 : 0.3}
                  >
                    {clip(p.node.linkAsset!, Math.max(8, (x2 - x1) / 6.5))}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((p) => {
            const color = p.node.teamColors[0] || '#ff6b35';
            const lit = !litSet || litSet.has(p.node.tradeId);
            const h = p.y1 - p.y0;
            const showLabel = h >= 14 || p.node.depth === 0;
            return (
              <g
                key={`n-${p.node.tradeId}`}
                onMouseEnter={() => setHovered(p.node.tradeId)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'default' }}
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
                    x={p.x + NODE_W + 4}
                    y={p.y0 + Math.min(h, 22) / 2}
                    dy="0.32em"
                    fontSize={10}
                    fontWeight={600}
                    fill="#fff"
                    fillOpacity={lit ? 1 : 0.45}
                    style={{ pointerEvents: 'none' }}
                  >
                    <tspan opacity={0.6}>{p.node.year} </tspan>
                    {clip(p.node.names[0] || p.node.label, 20)}
                    <tspan dx={5} fontWeight={700}>{p.node.total.toFixed(0)}</tspan>
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
    </div>
  );
}

function clip(s: string, maxChars: number): string {
  const m = Math.max(3, Math.floor(maxChars));
  return s.length > m ? s.slice(0, m - 1) + '…' : s;
}
