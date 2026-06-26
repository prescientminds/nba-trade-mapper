'use client';

/**
 * Side-by-side prototype: icicle vs. sankey on the same trade chain. Lets us compare the
 * two flow visualizations on real data before picking one for the product. Default root is
 * the 2013 Pierce/Garnett chain; override via ?trade=<id>.
 */

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildChainFlow, type TradeTreeNode, type SankeyGraphInput } from '@/lib/chain-hierarchy';
import ChainIcicle from '@/components/ChainIcicle';
import ChainSankey from '@/components/ChainSankey';
import ChainFlow from '@/components/ChainFlow';

const DEFAULT_ROOT = '53fb1654-6be8-4c58-a2fe-4d4f5df1a084';

function Inner() {
  const params = useSearchParams();
  const root = params.get('trade') ?? DEFAULT_ROOT;
  const [tree, setTree] = useState<TradeTreeNode | null>(null);
  const [sankey, setSankey] = useState<SankeyGraphInput | null>(null);
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
      setSankey(res.sankey);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const sectionTitle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: '#fff',
    margin: '0 0 2px',
  };
  const sectionSub: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '0 0 10px' };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', padding: 20, color: '#fff' }}>
      <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        Chain flow prototype — {status === 'ready' ? tree?.label : root}
      </h1>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>
        Same chain, two renderers. Block / ribbon size = downstream win shares.
      </p>

      {status === 'loading' && <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading chain…</p>}
      {status === 'empty' && <p style={{ color: 'rgba(255,255,255,0.5)' }}>No scored chain for this trade.</p>}

      {status === 'ready' && tree && sankey && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <section data-testid="flow-section">
            <h2 style={sectionTitle}>Chain flow — connective tissue + degree/year toggle</h2>
            <p style={sectionSub}>
              Trades as nodes; each ribbon is the asset that moved between them (the mechanism), thickness = downstream win shares. Toggle the x-axis between degree and calendar year.
            </p>
            <ChainFlow tree={tree} />
          </section>

          <section data-testid="icicle-section">
            <h2 style={sectionTitle}>A · Icicle (reference)</h2>
            <p style={sectionSub}>
              Columns = degree. Child blocks nest inside their parent&apos;s band, so lineage shows by adjacency.
            </p>
            <ChainIcicle tree={tree} />
          </section>

          <section data-testid="sankey-section">
            <h2 style={sectionTitle}>B · Sankey</h2>
            <p style={sectionSub}>
              Flowing ribbons, width = branch win shares. Directional read of value, not strict conservation.
            </p>
            <ChainSankey data={sankey} />
          </section>
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
