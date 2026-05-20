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
    position: { x: 80, y: 80 },
    data: {
      teamIds: ['LAL', 'BOS'],
      teamColors: ['#552583', '#007A33'],
      sides: [
        {
          teamId: 'LAL',
          playerNames: ['LeBron James', 'Austin Reaves'],
          picks: [
            {
              pick_key: '2027-1-LAL',
              year: 2027,
              round: 1,
              original_team_id: 'LAL',
              asset_class: 'pick',
              conditional: false,
              lineage: [],
            },
          ],
        },
        {
          teamId: 'BOS',
          playerNames: ['Jaylen Brown'],
          picks: [
            {
              pick_key: '2028-1-BOS',
              year: 2028,
              round: 1,
              original_team_id: 'BOS',
              asset_class: 'pick',
              conditional: true,
              lineage: [],
            },
            {
              pick_key: '2029-2-BOS',
              year: 2029,
              round: 2,
              original_team_id: 'BOS',
              asset_class: 'swap',
              conditional: false,
              lineage: [],
            },
          ],
        },
      ],
      assetCounts: { players: 3, picks: 3 },
    },
  },
  {
    id: 'hypo-2',
    type: 'hypotheticalTrade',
    position: { x: 360, y: 80 },
    data: {
      teamIds: ['LAL'],
      teamColors: ['#552583'],
      sides: [
        { teamId: 'LAL', playerNames: [], picks: [] },
        { teamId: null, playerNames: [], picks: [] },
      ],
      assetCounts: { players: 0, picks: 0 },
    },
  },
  {
    id: 'hypo-3',
    type: 'hypotheticalTrade',
    position: { x: 640, y: 80 },
    data: {
      teamIds: ['PHX', 'OKC'],
      teamColors: ['#1d1160', '#007ac1'],
      sides: [
        {
          teamId: 'PHX',
          playerNames: ['Devin Booker'],
          picks: [],
        },
        {
          teamId: 'OKC',
          playerNames: ['Shai Gilgeous-Alexander', 'Josh Giddey', 'Lu Dort'],
          picks: [
            {
              pick_key: '2026-1-OKC',
              year: 2026,
              round: 1,
              original_team_id: 'OKC',
              asset_class: 'pick',
              conditional: false,
              lineage: [],
            },
            {
              pick_key: '2027-1-OKC',
              year: 2027,
              round: 1,
              original_team_id: 'OKC',
              asset_class: 'pick',
              conditional: false,
              lineage: [],
            },
          ],
        },
      ],
      assetCounts: { players: 4, picks: 2 },
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
