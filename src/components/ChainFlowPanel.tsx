'use client';

/**
 * ChainFlowPanel — the in-canvas "column view": loads a trade's downstream chain and
 * renders it as the ChainFlow story (what turned into what, how, and the impact). This is
 * what the canvas ↔ column-view toggle shows.
 */

import { useEffect, useRef, useState } from 'react';
import { buildChainFlow, type TradeTreeNode } from '@/lib/chain-hierarchy';
import ChainFlow from '@/components/ChainFlow';
import type { League } from '@/lib/league';

export default function ChainFlowPanel({
  rootTradeId,
  league = 'NBA',
  onClose,
}: {
  rootTradeId: string;
  league?: League;
  onClose?: () => void;
}) {
  const [tree, setTree] = useState<TradeTreeNode | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1180);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    buildChainFlow(rootTradeId, league)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setStatus('empty');
          return;
        }
        setTree(res.tree);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [rootTradeId, league]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(640, el.clientWidth - 28));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--bg, #0a0a0f)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #f2f2f2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {tree?.label ?? 'Trade chain'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary, #888)', marginTop: 1 }}>
            What turned into what · ribbon = the asset that moved · thickness = downstream win shares · hover to trace a path
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close column view"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary, #aaa)', fontSize: 18, cursor: 'pointer', padding: '2px 8px', lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 14 }}>
        {status === 'loading' && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading chain…</div>}
        {status === 'empty' && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>This trade has no scored downstream chain yet.</div>}
        {status === 'error' && <div style={{ color: '#ff6b6b', fontSize: 13 }}>Couldn’t load the chain for this trade.</div>}
        {status === 'ready' && tree && <ChainFlow tree={tree} width={width} height={Math.max(420, (containerRef.current?.clientHeight ?? 560) - 90)} />}
      </div>
    </div>
  );
}
