'use client';

import { useEffect, useRef } from 'react';
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
    </ReactFlowProvider>
  );
}
