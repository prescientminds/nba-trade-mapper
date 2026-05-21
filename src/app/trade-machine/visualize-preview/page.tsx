'use client';

/**
 * Dev preview for Phase B item 6 (Visualize).
 *
 * Verifies the end-to-end Visualize flow on an isolated canvas:
 *   1. Seeds a HypotheticalTradeNode via the real store.
 *   2. Pushes a hand-built `Comparable[]` to latestComparablesByNodeId.
 *   3. Renders the Visualize button (enabled, count = 5).
 *   4. A "Fire Visualize" button calls visualizeHypothetical; the action
 *      resolves each trade id via loadTrade and spawns TradeNodes + edges.
 *   5. "Re-fire" demonstrates replace semantics — the previous spawned set
 *      is cleared, then re-spawned.
 *
 * Trade ids are real bbref ids from public/data/trades/by-season/2023-24.json.
 * MatchFactors / motivation are minimal stubs — the spawn pipeline only
 * needs `Comparable.id` to resolve a real TradeNode.
 *
 * Distinct from /trade-machine/node-preview (which verifies the node card
 * in isolation, no store, no trade nodes registered).
 */

import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from '@/lib/graph-store';
import HypotheticalTradeNode from '@/components/nodes/HypotheticalTradeNode';
import TradeNode from '@/components/nodes/TradeNode';
import HighlightableEdge from '@/components/edges/HighlightableEdge';
import ComparableToEdge from '@/components/edges/ComparableToEdge';
import type { Comparable } from '@/lib/comparables';

const nodeTypes = {
  hypotheticalTrade: HypotheticalTradeNode,
  trade: TradeNode,
};
const edgeTypes = {
  highlightable: HighlightableEdge,
  comparableTo: ComparableToEdge,
};

const SAMPLE_COMPARABLES: Comparable[] = [
  { id: 'bbref-2023-07-06-3c56d540', matchScore: 1.0, headline: 'Sample comparable #1' },
  { id: 'bbref-2023-07-06-1c4ea9b0', matchScore: 0.92, headline: 'Sample comparable #2' },
  { id: 'bbref-2023-07-06-9eb5a3e6', matchScore: 0.78, headline: 'Sample comparable #3' },
  { id: 'bbref-2023-07-06-500239d4', matchScore: 0.65, headline: 'Sample comparable #4' },
  { id: 'bbref-2023-07-06-b7788d55', matchScore: 0.41, headline: 'Sample comparable #5' },
];

function CanvasInner() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const addHypotheticalTrade = useGraphStore((s) => s.addHypotheticalTrade);
  const updateHypotheticalTrade = useGraphStore((s) => s.updateHypotheticalTrade);
  const setLatestComparables = useGraphStore((s) => s.setLatestComparables);
  const visualizeHypothetical = useGraphStore((s) => s.visualizeHypothetical);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const { fitView } = useReactFlow();

  const [hypoId, setHypoId] = useState<string | null>(null);

  // Seed on mount. Close the panel immediately (the standalone sandbox has
  // no panel mounted anyway) so the node is plain-clickable.
  useEffect(() => {
    clearGraph();
    const id = addHypotheticalTrade(['LAL', 'BOS']);
    updateHypotheticalTrade(id, [
      { teamId: 'LAL', playerNames: ['LeBron James'], picks: [] },
      { teamId: 'BOS', playerNames: ['Jaylen Brown'], picks: [] },
    ]);
    setLatestComparables(id, SAMPLE_COMPARABLES);
    setWritingNode(null);
    setHypoId(id);
    setTimeout(() => fitView({ padding: 0.4, duration: 0 }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spawnedCount = nodes.filter((n) => hypoId && n.id.startsWith(`cmp-${hypoId}-`)).length;
  const edgeCount = edges.filter((e) => hypoId && e.id.startsWith(`cmpedge-${hypoId}-`)).length;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0f', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-secondary)',
          maxWidth: 340,
          lineHeight: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div data-test-spawn-counts>
          Spawned: {spawnedCount} nodes, {edgeCount} edges
        </div>
        <button
          type="button"
          data-test-fire-visualize
          onClick={() => hypoId && visualizeHypothetical(hypoId)}
          style={{
            padding: '6px 10px',
            background: '#ff6b35',
            color: '#0a0a0f',
            border: 'none',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Fire Visualize
        </button>
        <button
          type="button"
          data-test-rotate-comparables
          onClick={() => {
            if (!hypoId) return;
            // Swap order to prove that re-fire replaces (not appends) the
            // spawned set. Same 5 ids, different positions.
            const rotated = [...SAMPLE_COMPARABLES].reverse();
            setLatestComparables(hypoId, rotated);
          }}
          style={{
            padding: '6px 10px',
            background: 'transparent',
            color: '#4ecdc4',
            border: '1px solid #4ecdc4',
            borderRadius: 3,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Rotate comparables (then Re-fire)
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
    </div>
  );
}

export default function VisualizePreview() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
