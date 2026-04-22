'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ReactFlowProvider } from '@xyflow/react';
import MainGraphCanvas from '@/components/MainGraphCanvas';
import { useGraphStore } from '@/lib/graph-store';
import { TEAMS } from '@/lib/teams';

interface Props {
  teamId: string;
  season: string;
}

function RosterSeeder({ teamId, season }: Props) {
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    const store = useGraphStore.getState();
    store.clearGraph();
    store.seedChampionshipRoster(teamId, season);
  }, [teamId, season]);

  return null;
}

export default function RosterClient({ teamId, season }: Props) {
  const validTeam = !!TEAMS[teamId];

  if (!validTeam) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          color: 'rgba(255,255,255,0.7)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Unknown team: {teamId}
          </div>
          <a href="/" style={{ color: '#ff6b35', fontSize: 13 }}>Go to NBA Trade Mapper</a>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <RosterSeeder teamId={teamId} season={season} />
      <MainGraphCanvas />
      {/* Build Trade entry — top-right overlay above the React Flow canvas */}
      <Link
        href={`/trade-machine?from=${teamId}`}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 50,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          background: 'var(--accent-orange)',
          color: '#0a0a0f',
          textDecoration: 'none',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          borderRadius: 'var(--radius-sm)',
          boxShadow: '0 4px 14px rgba(255, 107, 53, 0.35)',
        }}
      >
        Build Trade
      </Link>
    </ReactFlowProvider>
  );
}
