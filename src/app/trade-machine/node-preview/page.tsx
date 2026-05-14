'use client';

/**
 * Dev preview for the canvas-native Trade Machine (Phase B, Step 1).
 * Renders one HypotheticalTradeNode on a blank React Flow canvas so the
 * dashed-border / DRAFT-badge / write-mode-toggle visual can be verified
 * before the side panel (Step 2) and route wiring (Step 4) exist.
 *
 * Retire alongside `src/app/trade-machine/page.tsx` when Phase B ships.
 */

import { ReactFlow, Background, BackgroundVariant, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import HypotheticalTradeNode from '@/components/nodes/HypotheticalTradeNode';

const nodeTypes = { hypotheticalTrade: HypotheticalTradeNode };

const initialNodes: Node[] = [
  {
    id: 'hypo-1',
    type: 'hypotheticalTrade',
    position: { x: 200, y: 120 },
    data: {
      teamIds: ['LAL', 'BOS'],
      teamColors: ['#552583', '#007A33'],
      assetCounts: { players: 2, picks: 1 },
    },
  },
  {
    id: 'hypo-2',
    type: 'hypotheticalTrade',
    position: { x: 200, y: 260 },
    data: {
      teamIds: ['LAL'],
      teamColors: ['#552583'],
      assetCounts: { players: 0, picks: 0 },
    },
  },
];

export default function HypotheticalNodePreview() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0f' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          maxWidth: 320,
          lineHeight: 1.5,
        }}
      >
        Phase B · Step 1 preview — HypotheticalTradeNode.
        Click a card to toggle write-mode. ✕ removes. Side panel arrives in Step 2.
      </div>
      <ReactFlow
        nodes={initialNodes}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
    </div>
  );
}
