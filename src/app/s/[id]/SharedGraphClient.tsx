'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
import type { ChainTeamData } from '@/lib/graph-store';
import { loadSharedGraph } from '@/lib/share';
import type { ShareState } from '@/lib/share';
import { loadTrade, staticTradeToTradeWithDetails } from '@/lib/trade-data';
import { useMobile } from '@/lib/use-mobile';
import { getSupabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

import TradeNode from '@/components/nodes/TradeNode';
import PlayerNode from '@/components/nodes/PlayerNode';
import PickNode from '@/components/nodes/PickNode';
import PlayerStintNode from '@/components/nodes/PlayerStintNode';
import GapNode from '@/components/nodes/GapNode';
import ChampionshipNode from '@/components/nodes/ChampionshipNode';
import HighlightableEdge from '@/components/edges/HighlightableEdge';
import SearchOverlay from '@/components/SearchOverlay';
import ShareButton from '@/components/ShareButton';

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

// ── Toolbar (duplicated from page.tsx for the share page) ────────────
// We import the core graph toolbar actions inline rather than importing
// the full page.tsx component tree.

const IconZoomOut = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);
const IconZoomIn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);
const IconFitView = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
const IconHome = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const Separator = () => (
  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 2px', flexShrink: 0 }} />
);

function ToolbarButton({ icon, label, title, onClick, isMobile, accent }: {
  icon: React.ReactNode; label?: string; title: string; onClick: () => void; isMobile: boolean; accent?: string;
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: isMobile ? '8px 10px' : '5px 8px',
        minHeight: isMobile ? 36 : 'auto',
        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)',
        color: accent || 'rgba(255,255,255,0.6)',
        background: 'transparent', border: 'none', borderRadius: 4,
        cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function ShareToolbar() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const clearGraph = useGraphStore((s) => s.clearGraph);
  const nodes = useGraphStore((s) => s.nodes);
  const isMobile = useMobile();

  if (nodes.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : 62,
        bottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 16px))' : 'auto',
        left: '50%', transform: 'translateX(-50%)', zIndex: 8,
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '3px 4px',
        background: 'rgba(18, 18, 26, 0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <ToolbarButton icon={<IconZoomOut />} title="Zoom Out" onClick={() => zoomOut({ duration: 200 })} isMobile={isMobile} />
      <ToolbarButton icon={<IconZoomIn />} title="Zoom In" onClick={() => zoomIn({ duration: 200 })} isMobile={isMobile} />
      <ToolbarButton icon={<IconFitView />} label={isMobile ? undefined : "Fit"} title="Fit all nodes in view" onClick={() => fitView({ padding: 0.3, duration: 400 })} isMobile={isMobile} />
      <Separator />
      <ToolbarButton icon={<IconHome />} label={isMobile ? undefined : "Home"} title="Start a new search" onClick={clearGraph} isMobile={isMobile} />
      <Separator />
      <ShareButton />
    </div>
  );
}

// ── Replay engine ────────────────────────────────────────────────────

async function replayShareState(shareState: ShareState) {
  const store = useGraphStore.getState();
  const { seed, league, skin } = shareState;

  // Set league
  store.setSelectedLeague(league);

  // Restore visual skin (legacy shares without skin keep current default)
  if (skin) store.setVisualSkin(skin);

  // Replay the seed action
  switch (seed.type) {
    case 'trade': {
      const st = await loadTrade(seed.tradeId, league);
      if (!st) return false;
      const trade = staticTradeToTradeWithDetails(st);
      store.seedFromTrade(trade);
      break;
    }
    case 'chain': {
      const { data } = await getSupabase()
        .from('trade_chain_scores')
        .select('chain_scores')
        .eq('trade_id', seed.tradeId)
        .single() as { data: { chain_scores: Record<string, ChainTeamData> } | null };
      await store.seedFromChain(seed.tradeId, data?.chain_scores);
      break;
    }
    case 'player': {
      await store.seedFromPlayer(seed.playerName);
      break;
    }
    case 'championship': {
      await store.seedChampionshipRoster(seed.teamId, seed.season);
      break;
    }
  }

  // Replay expansions sequentially with small delays to let layout settle
  for (const nodeId of shareState.expansions) {
    await replayExpansion(nodeId);
    await new Promise((r) => setTimeout(r, 80));
  }

  return true;
}

async function replayExpansion(nodeId: string) {
  const store = useGraphStore.getState();

  // Already expanded — skip
  if (store.expandedNodes.has(nodeId)) return;

  // Find the node in the current graph
  const node = store.nodes.find((n) => n.id === nodeId);
  if (!node) return;

  try {
    switch (node.type) {
      case 'trade':
        store.expandTradeNode(nodeId);
        break;
      case 'player':
        await store.expandPlayerNode(nodeId);
        break;
      case 'pick':
        store.expandPickNode(nodeId);
        break;
      case 'playerStint':
        await store.expandStintDetails(nodeId);
        break;
    }
  } catch {
    // Skip failed expansions silently
  }
}

// ── Main component ───────────────────────────────────────────────────

function SharedGraphCanvas({ shareId }: { shareId: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const replayedRef = useRef(false);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const onNodesChange = useGraphStore((s) => s.onNodesChange);
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange);
  const pendingFitTarget = useGraphStore((s) => s.pendingFitTarget);
  const clearPendingFitTarget = useGraphStore((s) => s.clearPendingFitTarget);
  const clearHighlightedEdges = useGraphStore((s) => s.clearHighlightedEdges);
  const exitFollowPath = useGraphStore((s) => s.exitFollowPath);
  const { fitView } = useReactFlow();
  const isMobile = useMobile();

  // Center on pending fit target
  useEffect(() => {
    if (!pendingFitTarget) return;
    const timer = setTimeout(() => {
      fitView({ nodes: [{ id: pendingFitTarget }], padding: 0.5, duration: 500, maxZoom: 1.2 });
      clearPendingFitTarget();
    }, 120);
    return () => clearTimeout(timer);
  }, [pendingFitTarget, fitView, clearPendingFitTarget]);

  // Replay the shared graph state
  useEffect(() => {
    if (replayedRef.current) return;
    replayedRef.current = true;

    (async () => {
      try {
        const shared = await loadSharedGraph(shareId);
        if (!shared) {
          track('share_link_opened', { share_id: shareId, status: 'not_found' });
          setStatus('error');
          return;
        }

        track('share_link_opened', {
          share_id: shareId,
          status: 'ok',
          seed_type: shared.share_state?.seed?.type,
          expansion_count: shared.share_state?.expansions?.length,
        });

        // Clear any existing graph
        useGraphStore.getState().clearGraph();

        const ok = await replayShareState(shared.share_state);
        if (!ok) { setStatus('error'); return; }

        // Fit view after reconstruction settles
        setTimeout(() => {
          fitView({ padding: 0.3, duration: 600 });
          setStatus('ready');
        }, 500);
      } catch (err) {
        console.error('Failed to load shared graph:', err);
        track('share_link_opened', { share_id: shareId, status: 'error' });
        setStatus('error');
      }
    })();
  }, [shareId, fitView]);

  // Fit view once nodes load (backup for seed types with async expansion)
  const prevNodeCount = useRef(0);
  useEffect(() => {
    if (status !== 'loading') return;
    if (nodes.length > 0 && nodes.length !== prevNodeCount.current) {
      prevNodeCount.current = nodes.length;
      const timer = setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 300);
      return () => clearTimeout(timer);
    }
  }, [nodes.length, status, fitView]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Loading overlay */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(10, 10, 15, 0.85)', backdropFilter: 'blur(8px)',
        }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Loading shared graph...</div>
            <div style={{
              width: 32, height: 32, margin: '0 auto',
              border: '2px solid rgba(255,255,255,0.15)',
              borderTopColor: '#ff6b35',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0f',
        }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Graph not found</div>
            <a href="/" style={{ color: '#ff6b35', fontSize: 13 }}>Go to NBA Trade Mapper</a>
          </div>
        </div>
      )}

      <SearchOverlay />
      <ShareToolbar />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onPaneClick={() => { clearHighlightedEdges(); exitFollowPath(); }}
          minZoom={0.1}
          maxZoom={2}
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
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1a1a2e" />
          {!isMobile && (
            <MiniMap
              pannable zoomable
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
                bottom: 16, right: 16,
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

export default function SharedGraphClient({ shareId }: { shareId: string }) {
  return (
    <ReactFlowProvider>
      <SharedGraphCanvas shareId={shareId} />
    </ReactFlowProvider>
  );
}
