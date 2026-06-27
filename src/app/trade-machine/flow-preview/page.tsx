'use client';

/**
 * Dev preview for the ChainFlow view. Renders the flow on a chain in isolation so it can
 * be tested against any trade without seeding the canvas. Default root is the 2013
 * Pierce/Garnett chain; override via ?trade=<id>.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildChainFlow, type TradeTreeNode } from '@/lib/chain-hierarchy';
import ChainFlow from '@/components/ChainFlow';

const DEFAULT_ROOT = '53fb1654-6be8-4c58-a2fe-4d4f5df1a084';

function Inner() {
  const params = useSearchParams();
  const root = params.get('trade') ?? DEFAULT_ROOT;
  const [tree, setTree] = useState<TradeTreeNode | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    buildChainFlow(root).then((res) => {
      if (cancelled) return;
      if (!res) {
        setStatus('empty');
        return;
      }
      setTree(res.tree);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [root]);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', padding: 20, color: '#fff' }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        Chain flow — {status === 'ready' ? tree?.label : root}
      </h1>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>
        What turned into what, how, and the impact. Ribbon = the asset that moved; thickness = downstream win shares.
      </p>
      {status === 'loading' && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading chain…</p>}
      {status === 'empty' && <p style={{ color: 'rgba(255,255,255,0.5)' }}>No scored chain for this trade.</p>}
      {status === 'ready' && tree && (
        <div data-testid="flow-section">
          <ChainFlow tree={tree} />
        </div>
      )}
    </div>
  );
}

export default function FlowPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
