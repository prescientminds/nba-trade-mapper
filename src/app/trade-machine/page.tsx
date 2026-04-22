import type { Metadata } from 'next';
import { Suspense } from 'react';
import TradeMachineClient from './TradeMachineClient';

export const metadata: Metadata = {
  title: 'Trade Machine | NBA Trade Mapper',
  description:
    'Build a hypothetical trade and see the five historical deals it most resembles.',
};

// Server shell — the real work happens in the client component, which reads
// search params (`?from=`) and handles Supabase + comparables fetches.
export default function TradeMachinePage() {
  return (
    <Suspense fallback={<TradeMachineFallback />}>
      <TradeMachineClient />
    </Suspense>
  );
}

function TradeMachineFallback() {
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
      Loading trade machine…
    </div>
  );
}
