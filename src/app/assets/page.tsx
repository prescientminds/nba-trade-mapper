import type { Metadata } from 'next';
import { Suspense } from 'react';
import AssetsClient from './AssetsClient';

export const metadata: Metadata = {
  title: 'Team Asset Board | NBA Trade Mapper',
  description:
    'Sortable view of every NBA team\'s tradeable assets — cap space, future picks, young talent, and stars.',
};

export default function AssetsPage() {
  return (
    <Suspense fallback={<AssetsFallback />}>
      <AssetsClient />
    </Suspense>
  );
}

function AssetsFallback() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
      }}
    >
      Loading asset board…
    </div>
  );
}
