'use client';

/**
 * ChainSankey — the same trade chain as flowing ribbons. Stage (x) = degree; ribbon
 * width = win shares down that branch. The literal "funnel reflecting win shares" shape.
 *
 * Honest caveat baked into the labeling: win shares are created fresh downstream, so the
 * widths are a directional read of branch value, not strict flow conservation.
 */

import { useMemo, useState } from 'react';
import { sankey, sankeyLinkHorizontal, type SankeyGraph, type SankeyNode, type SankeyLink } from 'd3-sankey';
import type { SankeyGraphInput } from '@/lib/chain-hierarchy';

interface NodeExtra {
  id: string;
  label: string;
  year: string;
  names: string[];
  teamColors: string[];
  depth: number;
}
type SNode = SankeyNode<NodeExtra, Record<string, never>>;
type SLink = SankeyLink<NodeExtra, Record<string, never>>;

export default function ChainSankey({
  data,
  width = 1100,
  height = 520,
}: {
  data: SankeyGraphInput;
  width?: number;
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const graph = useMemo(() => {
    const gen = sankey<NodeExtra, Record<string, never>>()
      .nodeWidth(13)
      .nodePadding(7)
      .extent([
        [4, 8],
        [width - 4, height - 8],
      ]);
    // d3-sankey mutates its inputs; hand it fresh copies.
    const input: SankeyGraph<NodeExtra, Record<string, never>> = {
      nodes: data.nodes.map((n) => ({ ...n })) as SNode[],
      links: data.links.map((l) => ({ ...l })) as unknown as SLink[],
    };
    return gen(input);
  }, [data, width, height]);

  const linkPath = sankeyLinkHorizontal<NodeExtra, Record<string, never>>();

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block', fontFamily: 'var(--font-body, system-ui)' }}>
        {/* links */}
        <g fill="none">
          {graph.links.map((l, i) => {
            const src = l.source as SNode;
            const tgt = l.target as SNode;
            const color = src.teamColors?.[0] || '#ff6b35';
            const active = hovered === src.id || hovered === tgt.id;
            return (
              <path
                key={i}
                d={linkPath(l) ?? undefined}
                stroke={color}
                strokeOpacity={hovered ? (active ? 0.7 : 0.12) : 0.38}
                strokeWidth={Math.max(1, l.width ?? 1)}
              >
                <title>
                  {tgt.year} {tgt.label} · {(l.value ?? 0).toFixed(1)} WS
                </title>
              </path>
            );
          })}
        </g>
        {/* nodes */}
        <g>
          {graph.nodes.map((n) => {
            const x0 = n.x0 ?? 0;
            const y0 = n.y0 ?? 0;
            const h = (n.y1 ?? 0) - y0;
            const color = n.teamColors?.[0] || '#ff6b35';
            const dim = hovered && hovered !== n.id;
            const showLabel = h >= 11 || n.depth === 0;
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={x0}
                  y={y0}
                  width={(n.x1 ?? 0) - x0}
                  height={Math.max(1, h)}
                  fill={color}
                  fillOpacity={dim ? 0.3 : 1}
                  stroke="rgba(0,0,0,0.4)"
                  strokeWidth={0.5}
                  rx={2}
                />
                {showLabel && (
                  <text
                    x={x0 < width / 2 ? (n.x1 ?? 0) + 4 : x0 - 4}
                    y={y0 + h / 2}
                    dy="0.35em"
                    textAnchor={x0 < width / 2 ? 'start' : 'end'}
                    fontSize={9.5}
                    fill="rgba(255,255,255,0.82)"
                    fillOpacity={dim ? 0.4 : 1}
                    style={{ pointerEvents: 'none' }}
                  >
                    {n.year} {clip(n.names[0] || n.label, 22)}
                  </text>
                )}
                <title>
                  {n.year} {n.label}{n.names.length ? `\n${n.names.join(', ')}` : ''}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function clip(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}
