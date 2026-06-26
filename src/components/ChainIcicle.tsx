'use client';

/**
 * ChainIcicle — a value-weighted icicle (partition) view of a trade chain.
 *
 * Columns = degree (one trade deeper per column). A block's height is proportional to the
 * total downstream win shares of that branch, so the trunk reads big and dead-end flips
 * read thin. Child blocks sit flush to the right of their parent and only span the
 * parent's band, so lineage is visible by adjacency — Tatum and Kyrie become two stacks
 * under the root, no crossing lines. Hovering a block lights its path back to the root.
 */

import { useMemo, useState } from 'react';
import type { TradeTreeNode } from '@/lib/chain-hierarchy';

interface Rect {
  node: TradeTreeNode;
  x: number;
  y: number;
  w: number;
  h: number;
  path: string[]; // ancestor trade ids incl. self, root-first
}

const COL_W = 178;
const COL_GAP = 3;
const MIN_H = 2; // skip sub-2px blocks (and their subtrees) to keep the dense tree legible

function layout(root: TradeTreeNode, height: number): { rects: Rect[]; maxDepth: number; dropped: number } {
  const rects: Rect[] = [];
  let maxDepth = 0;
  let dropped = 0;

  function place(node: TradeTreeNode, y0: number, y1: number, depth: number, path: string[]) {
    const h = y1 - y0;
    if (h < MIN_H) {
      dropped += 1;
      return;
    }
    maxDepth = Math.max(maxDepth, depth);
    const selfPath = [...path, node.tradeId];
    rects.push({ node, x: depth * COL_W, y: y0, w: COL_W - COL_GAP, h, path: selfPath });
    if (node.children.length === 0 || node.total <= 0) return;
    let cursor = y0;
    for (const child of node.children) {
      const ch = (child.total / node.total) * h;
      place(child, cursor, cursor + ch, depth + 1, selfPath);
      cursor += ch;
    }
    // The gap below `cursor` (= node.directValue / node.total) is value retained at this
    // trade and never re-traded; we leave it empty rather than inflate the children.
  }

  place(root, 0, height, 0, []);
  return { rects, maxDepth, dropped };
}

export default function ChainIcicle({
  tree,
  height = 520,
  onSelect,
}: {
  tree: TradeTreeNode;
  height?: number;
  onSelect?: (tradeId: string) => void;
}) {
  const { rects, maxDepth, dropped } = useMemo(() => layout(tree, height), [tree, height]);
  const [hovered, setHovered] = useState<string | null>(null);

  const hoveredRect = hovered ? rects.find((r) => r.node.tradeId === hovered) : null;
  const litSet = hoveredRect ? new Set(hoveredRect.path) : null;

  const svgWidth = (maxDepth + 1) * COL_W;

  return (
    <div style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
      <svg width={svgWidth} height={height + 20} style={{ display: 'block', fontFamily: 'var(--font-body, system-ui)' }}>
        {/* degree headers */}
        {Array.from({ length: maxDepth + 1 }, (_, d) => (
          <text
            key={`hdr-${d}`}
            x={d * COL_W + 2}
            y={12}
            fontSize={9}
            fontWeight={700}
            letterSpacing={0.6}
            fill="rgba(255,255,255,0.4)"
          >
            {d === 0 ? 'ROOT' : `DEGREE ${d}`}
          </text>
        ))}
        <g transform="translate(0, 20)">
          {rects.map((r) => {
            const lit = !litSet || litSet.has(r.node.tradeId);
            const color = r.node.teamColors[0] || '#ff6b35';
            const showText = r.h >= 13;
            const showNames = r.h >= 30 && r.w > 90;
            return (
              <g
                key={r.node.tradeId}
                transform={`translate(${r.x},${r.y})`}
                onMouseEnter={() => setHovered(r.node.tradeId)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect?.(r.node.tradeId)}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
              >
                <rect
                  width={r.w}
                  height={Math.max(0, r.h - 1)}
                  rx={3}
                  fill={color}
                  fillOpacity={lit ? 0.9 : 0.22}
                  stroke={r.node.depth === 0 ? '#fff' : 'rgba(0,0,0,0.35)'}
                  strokeWidth={r.node.depth === 0 ? 1.5 : 0.5}
                />
                {showText && (
                  <text
                    x={6}
                    y={13}
                    fontSize={11}
                    fontWeight={600}
                    fill="#fff"
                    fillOpacity={lit ? 1 : 0.5}
                    style={{ pointerEvents: 'none' }}
                  >
                    <tspan opacity={0.7}>{r.node.year} </tspan>
                    {clip(r.node.label, r.w - 50)}
                    <tspan dx={6} fontWeight={700} fill="#fff">
                      {r.node.total.toFixed(0)}
                    </tspan>
                  </text>
                )}
                {showNames && (
                  <text x={6} y={27} fontSize={10} fill="rgba(255,255,255,0.85)" fillOpacity={lit ? 1 : 0.5} style={{ pointerEvents: 'none' }}>
                    {clip(r.node.names.join(', '), r.w - 12)}
                  </text>
                )}
                <title>
                  {r.node.year} {r.node.label} · {r.node.total.toFixed(1)} WS{r.node.names.length ? `\n${r.node.names.join(', ')}` : ''}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
      {dropped > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', padding: '4px 2px' }}>
          {dropped} thin branches hidden (under {MIN_H}px). Total chain ≈ {tree.total.toFixed(0)} WS.
        </div>
      )}
    </div>
  );
}

/** Rough character clip so long titles don't overflow the block. ~6px/char at 11px. */
function clip(s: string, maxPx: number): string {
  const maxChars = Math.max(3, Math.floor(maxPx / 6));
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}
