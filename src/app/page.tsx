'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useMobile } from '@/lib/use-mobile';
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
import HighlightableEdge from '@/components/edges/HighlightableEdge';
import SearchOverlay from '@/components/SearchOverlay';
import ShareButton from '@/components/ShareButton';
import CardPreviewModal from '@/components/CardPreviewModal';
import { SKINS } from '@/lib/skins';
import { createPortal } from 'react-dom';
import GuidedTour from '@/components/tour/Tour';

const nodeTypes = {
  trade: TradeNode,
  player: PlayerNode,
  pick: PickNode,
  playerStint: PlayerStintNode,
  gap: GapNode,
  championship: ChampionshipNode,
};

const edgeTypes = {
  highlightable: HighlightableEdge,
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
  const collapseChampionshipStaged = useGraphStore((s) => s.collapseChampionshipStaged);
  const coreNodes = useGraphStore((s) => s.coreNodes);
  const championshipContext = useGraphStore((s) => s.championshipContext);
  const expandAllChampionshipPlayers = useGraphStore((s) => s.expandAllChampionshipPlayers);
  const expandChampionshipWeb = useGraphStore((s) => s.expandChampionshipWeb);
  const visualSkin = useGraphStore((s) => s.visualSkin);
  const setVisualSkin = useGraphStore((s) => s.setVisualSkin);
  const seedInfo = useGraphStore((s) => s.seedInfo);
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const isMobile = useMobile();
  const [expanding, setExpanding] = useState(false);
  const [champExpanding, setChampExpanding] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  const handleFit = useCallback(() => {
    fitView({ padding: 0.3, duration: 400 });
  }, [fitView]);

  if (nodes.length === 0) return null;

  const hasTradeNodes = nodes.some(n => n.type === 'trade');
  const hasNonCoreNodes = nodes.some(n => !coreNodes.has(n.id));
  const hasUnexpandedPlayers = championshipContext
    ? championshipContext.players.length > (championshipContext.expandedPaths?.size ?? 0)
    : false;
  // Check if any expanded players are in 'road' phase with post-championship stints
  const hasRoadPhasePlayers = championshipContext
    ? championshipContext.players.some(p =>
        championshipContext.expandedPaths.has(p.playerName)
        && championshipContext.playerPhases.get(p.playerName) === 'road'
        && p.championshipStintIndex < p.allStints.length - 1
      )
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
        bottom: isMobile ? 'calc(20px + env(safe-area-inset-bottom, 16px))' : 'auto',
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
      {/* Home — far left, always visible */}
      <span data-tour="toolbar-home">
        <ToolbarButton icon={<IconHome />} label={isMobile ? undefined : "Home"} title="Clear graph and start a new search" onClick={clearGraph} isMobile={isMobile} accent="rgba(255,255,255,0.85)" />
      </span>

      <Separator />

      {/* Zoom group */}
      <span data-tour="toolbar-zoom" style={{ display: 'flex', alignItems: 'center' }}>
        <ToolbarButton icon={<IconZoomOut />} title="Zoom Out" onClick={() => zoomOut({ duration: 200 })} isMobile={isMobile} />
        <ToolbarButton icon={<IconZoomIn />} title="Zoom In" onClick={() => zoomIn({ duration: 200 })} isMobile={isMobile} />
        <ToolbarButton icon={<IconFitView />} label={isMobile ? undefined : "Fit"} title="Fit all nodes in view" onClick={handleFit} isMobile={isMobile} />
      </span>

      <Separator />

      {/* Expand / Reduce group */}
      <span data-tour="toolbar-expand">
        <ToolbarButton
          icon={<IconExpand />}
          label={isMobile ? undefined : "Expand"}
          title="Expand trade web one layer deeper"
          onClick={handleExpand}
          disabled={!hasTradeNodes || expanding}
          isMobile={isMobile}
        />
      </span>
      <span data-tour="toolbar-reduce">
        <ToolbarButton
          icon={<IconReduce />}
          label={isMobile ? undefined : "Reduce"}
          title="Collapse outermost layer of nodes"
          onClick={championshipContext ? collapseChampionshipStaged : collapseOneDegree}
          disabled={!hasNonCoreNodes}
          isMobile={isMobile}
        />
      </span>

      {/* Championship buttons (conditional) */}
      {(hasUnexpandedPlayers || hasRoadPhasePlayers) && (
        <>
          <Separator />
          {hasUnexpandedPlayers && (
            <ToolbarButton
              icon={<IconExpand />}
              label={isMobile ? undefined : "All Paths"}
              title="Expand road-to-championship paths for all players"
              onClick={async () => {
                setChampExpanding(true);
                try { await expandAllChampionshipPlayers(); } finally { setChampExpanding(false); }
              }}
              disabled={champExpanding}
              accent="#f9c74f"
              isMobile={isMobile}
            />
          )}
          {hasRoadPhasePlayers && (
            <ToolbarButton
              icon={<IconExpand />}
              label={isMobile ? undefined : "Post-Championship"}
              title="Show where players went after the championship"
              onClick={async () => {
                setChampExpanding(true);
                try { await expandChampionshipWeb(); } finally { setChampExpanding(false); }
              }}
              disabled={champExpanding}
              accent="#f9c74f"
              isMobile={isMobile}
            />
          )}
        </>
      )}

      <Separator />

      {/* Reset */}
      <span data-tour="toolbar-reset">
        <ToolbarButton icon={<IconReset />} label={isMobile ? undefined : "Reset"} title="Collapse all expansions back to initial view" onClick={collapseAll} isMobile={isMobile} />
      </span>

      <Separator />
      <span data-tour="toolbar-share">
        <ShareButton />
      </span>

      {/* Card creator button — only for trade seeds */}
      {seedInfo?.type === 'trade' && (() => {
        const tradeNode = nodes.find(n => n.type === 'trade' && (n.data as { trade: { id: string } }).trade.id === seedInfo.tradeId);
        const tradeDate = tradeNode ? (tradeNode.data as { trade: { date?: string } }).trade.date || undefined : undefined;
        return (
          <>
            <button
              onClick={() => setCardModalOpen(true)}
              title="Create shareable card image"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: isMobile ? '8px 10px' : '5px 8px',
                minHeight: isMobile ? 36 : 'auto',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                color: '#f9c74f',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {!isMobile && <span>Card</span>}
            </button>
            {cardModalOpen && createPortal(
              <CardPreviewModal
                tradeId={seedInfo.tradeId}
                tradeDate={tradeDate}
                onClose={() => setCardModalOpen(false)}
              />,
              document.body,
            )}
          </>
        );
      })()}

      <Separator />
      {/* Skin picker */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
        <path d="M2 6V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2" />
        <path d="M2 6h20v4H2z" fill="rgba(255,255,255,0.15)" />
        <path d="M4 10v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <path d="M16 16l4 4" />
      </svg>
      <div data-tour="toolbar-skins" style={{ display: 'flex', gap: 2 }}>
        {SKINS.map((skin) => (
          <button
            key={skin.id}
            onClick={() => setVisualSkin(skin.id)}
            style={{
              padding: isMobile ? '4px 5px' : '4px 7px',
              borderRadius: 5,
              border: 'none',
              background: visualSkin === skin.id
                ? (skin.id === 'holographic'
                    ? 'linear-gradient(135deg, #ff6b35, #9b5de5)'
                    : skin.id === 'insideStuff'
                      ? 'linear-gradient(135deg, #f5a623, #e8742a)'
                      : skin.id === 'nbaJam'
                        ? 'linear-gradient(135deg, #00CCCC, #008888)'
                        : 'var(--accent-orange)')
                : 'transparent',
              color: visualSkin === skin.id ? '#fff' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              letterSpacing: 0.4,
              transition: 'var(--transition-fast)',
            }}
          >
            {skin.shortLabel}
          </button>
        ))}
      </div>
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
  const clearHighlightedEdges = useGraphStore((s) => s.clearHighlightedEdges);
  const exitFollowPath = useGraphStore((s) => s.exitFollowPath);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const visualSkin = useGraphStore((s) => s.visualSkin);
  const { fitView } = useReactFlow();
  const isMobile = useMobile();
  const prevExpandedRef = useRef<Set<string>>(new Set());

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

  // Auto-center newly expanded nodes on mobile
  useEffect(() => {
    if (!isMobile) {
      prevExpandedRef.current = new Set(expandedNodes);
      return;
    }
    const prev = prevExpandedRef.current;
    // Find nodes that are in expandedNodes but weren't before
    const newlyExpanded: string[] = [];
    expandedNodes.forEach((id) => {
      if (!prev.has(id)) newlyExpanded.push(id);
    });
    prevExpandedRef.current = new Set(expandedNodes);

    if (newlyExpanded.length > 0 && !pendingFitTarget) {
      const timer = setTimeout(() => {
        fitView({
          nodes: newlyExpanded.map((id) => ({ id })),
          padding: 0.4,
          duration: 400,
          maxZoom: 1.2,
        });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [expandedNodes, isMobile, fitView, pendingFitTarget]);

  return (
    <div data-skin={visualSkin} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <SearchOverlay />
      <GraphToolbar />
      <GuidedTour />
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
          edgeTypes={edgeTypes}
          onPaneClick={() => { clearHighlightedEdges(); exitFollowPath(); }}
          minZoom={0.1}
          maxZoom={4}
          panOnDrag={true}
          zoomOnPinch={true}
          zoomOnScroll={!isMobile}
          nodeDragThreshold={isMobile ? 8 : 4}
          selectionOnDrag={false}
          defaultEdgeOptions={{
            type: 'highlightable',
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
              pannable
              zoomable
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
