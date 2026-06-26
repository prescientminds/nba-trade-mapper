'use client';

/**
 * Dev preview for Column View — a Finder-style, depth-ranked reading of a trade chain.
 * Seeds a known deep chain (2013-14, BFS depth 7, 39 downstream trades) so the column
 * population, drill-down, keyboard nav, and WS sort can be verified against live
 * Supabase + static-JSON data before the production view-mode toggle is wired in.
 *
 * Override the root via ?trade=<id>.
 */

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import ColumnView from '@/components/ColumnView';

const DEFAULT_ROOT = '53fb1654-6be8-4c58-a2fe-4d4f5df1a084';

function Preview() {
  const params = useSearchParams();
  const root = params.get('trade') ?? DEFAULT_ROOT;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f' }}>
      <ColumnView rootTradeId={root} onSelectTrade={(id) => console.log('activate', id)} />
    </div>
  );
}

export default function ColumnPreviewPage() {
  return (
    <Suspense fallback={null}>
      <Preview />
    </Suspense>
  );
}
