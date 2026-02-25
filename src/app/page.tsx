'use client';

import { useEffect, useState, useCallback } from 'react';

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
import GapNode from '@/components/nodes/GapNode';
import ChampionshipNode from '@/components/nodes/ChampionshipNode';
import SearchOverlay from '@/components/SearchOverlay';

const nodeTypes = {
  trade: TradeNode,
  player: PlayerNode,
  pick: PickNode,
  playerStint: PlayerStintNode,
  gap: GapNode,
  championship: ChampionshipNode,
};

// ── SVG icons for toolbar ──────────────────────────────────────────────
const IconZoomOut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const IconZoomIn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const IconFitView = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

const IconExpand = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconReduce = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconReset = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

const IconHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const Separator = () => (
  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />
);

// ── Toolbar button ──────────────────────────────────────────────────────
function ToolbarButton({
  icon,
  label,
  title,
  onClick,
  disabled,
  accent,
  isMobile,
}: {
  icon: React.ReactNode;
  label?: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: string;
  isMobile: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: isMobile ? '8px 10px' : '5px 8px',
        minHeight: isMobile ? 36 : 'auto',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        color: disabled ? 'rgba(255,255,255,0.25)' : (accent || 'rgba(255,255,255,0.6)'),
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.color = accent || 'rgba(255,255,255,0.9)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = disabled ? 'rgba(255,255,255,0.25)' : (accent || 'rgba(255,255,255,0.6)');
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Floating toolbar ────────────────────────────────────────────────────
function GraphToolbar() {
  const nodes = useGraphStore((s) => s.nodes);
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const collapseAll = useGraphStore((s) => s.collapseAll);
  const expandOneDegree = useGraphStore((s) => s.expandOneDegree);
  const collapseOneDegree = useGraphStore((s) => s.collapseOneDegree);
  const coreNodes = useGraphStore((s) => s.coreNodes);
  const championshipContext = useGraphStore((s) => s.championshipContext);
  const expandAllChampionshipPlayers = useGraphStore((s) => s.expandAllChampionshipPlayers);
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const isMobile = useMobile();
  const [expanding, setExpanding] = useState(false);

  const handleFit = useCallback(() => {
    fitView({ padding: 0.3, duration: 400 });
  }, [fitView]);

  if (nodes.length === 0) return null;

  const hasTradeNodes = nodes.some(n => n.type === 'trade');
  const hasNonCoreNodes = nodes.some(n => !coreNodes.has(n.id));
  const hasUnexpandedPlayers = championshipContext
    ? championshipContext.players.length > (championshipContext.expandedPaths?.size ?? 0)
    : false;

  const handleExpand = async () => {
    setExpanding(true);
    try { await expandOneDegree(); } finally { setExpanding(false); }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : 62,
        bottom: isMobile ? 16 : 'auto',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '3px 4px',
        background: 'rgba(18, 18, 26, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {/* Zoom group */}
      <ToolbarButton icon={<IconZoomOut />} title="Zoom Out" onClick={() => zoomOut({ duration: 200 })} isMobile={isMobile} />
      <ToolbarButton icon={<IconZoomIn />} title="Zoom In" onClick={() => zoomIn({ duration: 200 })} isMobile={isMobile} />
      <ToolbarButton icon={<IconFitView />} label="Fit" title="Fit all nodes in view" onClick={handleFit} isMobile={isMobile} />

      <Separator />

      {/* Expand / Reduce group */}
      <ToolbarButton
        icon={<IconExpand />}
        label="Expand"
        title="Expand trade web one layer deeper"
        onClick={handleExpand}
        disabled={!hasTradeNodes || expanding}
        isMobile={isMobile}
      />
      <ToolbarButton
        icon={<IconReduce />}
        label="Reduce"
        title="Collapse outermost layer of nodes"
        onClick={collapseOneDegree}
        disabled={!hasNonCoreNodes}
        isMobile={isMobile}
      />

      {/* Championship expand all (conditional) */}
      {hasUnexpandedPlayers && (
        <>
          <Separator />
          <ToolbarButton
            icon={<IconExpand />}
            label="All Paths"
            title="Expand career paths for all championship players"
            onClick={expandAllChampionshipPlayers}
            accent="#f9c74f"
            isMobile={isMobile}
          />
        </>
      )}

      <Separator />

      {/* Reset / Home group */}
      <ToolbarButton icon={<IconReset />} label="Reset" title="Collapse all expansions back to initial view" onClick={collapseAll} isMobile={isMobile} />
      <ToolbarButton icon={<IconHome />} label="Home" title="Clear graph and start a new search" onClick={clearGraph} isMobile={isMobile} />
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
      <GraphToolbar />
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
          panOnDrag={true}
          zoomOnPinch={true}
          zoomOnScroll={!isMobile}
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
          {/* MiniMap: hide on mobile (too small to tap usefully) */}
          {!isMobile && (
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'trade') return '#ff6b35';
                if (node.type === 'player') return '#4ecdc4';
                if (node.type === 'pick') return '#f9c74f';
                if (node.type === 'playerStint') return '#9b5de5';
                if (node.type === 'championship') return '#f9c74f';
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
