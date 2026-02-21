'use client';

import { useEffect, useState } from 'react';

/** True on narrow/touch screens. Re-checks on resize. */
function useMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () =>
      setMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return mobile;
}
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from '@/lib/graph-store';
import TradeNode from '@/components/nodes/TradeNode';
import PlayerNode from '@/components/nodes/PlayerNode';
import PickNode from '@/components/nodes/PickNode';
import PlayerStintNode from '@/components/nodes/PlayerStintNode';
import TransitionNode from '@/components/nodes/TransitionNode';
import GapNode from '@/components/nodes/GapNode';
import SearchOverlay from '@/components/SearchOverlay';

const nodeTypes = {
  trade: TradeNode,
  player: PlayerNode,
  pick: PickNode,
  playerStint: PlayerStintNode,
  transition: TransitionNode,
  gap: GapNode,
};

function CanvasControls() {
  const nodes = useGraphStore((s) => s.nodes);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const collapseAll = useGraphStore((s) => s.collapseAll);
  const isMobile = useMobile();

  if (nodes.length === 0) return null;

  const btnStyle: React.CSSProperties = {
    padding: isMobile ? '10px 16px' : '5px 10px',
    minHeight: isMobile ? 44 : 'auto',
    fontSize: isMobile ? 13 : 11,
    fontWeight: 600,
    fontFamily: 'var(--font-body)',
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : 12,
        bottom: isMobile ? 80 : 'auto',
        right: isMobile ? 12 : 12,
        zIndex: 8,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 6,
      }}
    >
      <button
        style={btnStyle}
        onClick={collapseAll}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-elevated)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        title="Collapse all expanded nodes"
      >
        Collapse All
      </button>
      <button
        style={btnStyle}
        onClick={clearGraph}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-elevated)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
        title="Clear graph and return to search"
      >
        Home
      </button>
    </div>
  );
}

function GraphCanvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const pendingFitTarget = useGraphStore((s) => s.pendingFitTarget);
  const clearPendingFitTarget = useGraphStore((s) => s.clearPendingFitTarget);
  const { fitView } = useReactFlow();
  const isMobile = useMobile();

  // Center viewport on the target node after journey/trade loads
  useEffect(() => {
    if (!pendingFitTarget) return;
    const timer = setTimeout(() => {
      fitView({
        nodes: [{ id: pendingFitTarget }],
        padding: 0.5,
        duration: 500,
        maxZoom: 1.2,
      });
      clearPendingFitTarget();
    }, 120);
    return () => clearTimeout(timer);
  }, [pendingFitTarget, fitView, clearPendingFitTarget]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <SearchOverlay />
      <CanvasControls />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          minZoom={0.1}
          maxZoom={2}
          // Touch: 1-finger pan, 2-finger pinch zoom
          panOnDrag={true}
          zoomOnPinch={true}
          zoomOnScroll={!isMobile}
          // Require 8px of movement before a node drag starts — distinguishes taps from drags
          nodeDragThreshold={isMobile ? 8 : 4}
          selectionOnDrag={false}
          defaultEdgeOptions={{
            type: 'straight',
            style: { stroke: '#555', strokeWidth: 1.5 },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#1a1a2e"
          />
          {/* Controls: hide on mobile (pinch to zoom is sufficient) */}
          {!isMobile && (
            <Controls
              showInteractive={false}
              style={{ bottom: 16, left: 16 }}
            />
          )}
          {/* MiniMap: hide on mobile (too small to tap usefully) */}
          {!isMobile && (
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'trade') return '#ff6b35';
                if (node.type === 'player') return '#4ecdc4';
                if (node.type === 'pick') return '#f9c74f';
                if (node.type === 'playerStint') return '#9b5de5';
                if (node.type === 'transition') return '#888';
                if (node.type === 'gap') return '#444';
                return '#666';
              }}
              maskColor="rgba(10, 10, 15, 0.8)"
              style={{
                bottom: 16,
                right: 16,
                background: '#12121a',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
              }}
            />
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
}
