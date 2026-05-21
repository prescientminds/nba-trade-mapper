'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import DiscoverySection from '@/components/DiscoverySection';
import { useGraphStore } from '@/lib/graph-store';
import type { ChainTeamData } from '@/lib/graph-store';
import type { TradeWithDetails } from '@/lib/supabase';
import type { League } from '@/lib/league';
import { track } from '@/lib/analytics';

export default function ExploreCategoryClient({
  categoryId,
}: {
  categoryId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const league: League = searchParams.get('league') === 'WNBA' ? 'WNBA' : 'NBA';

  const setSelectedLeague = useGraphStore((s) => s.setSelectedLeague);
  const seedFromTrade = useGraphStore((s) => s.seedFromTrade);
  const seedFromChain = useGraphStore((s) => s.seedFromChain);
  const seedFromPlayer = useGraphStore((s) => s.seedFromPlayer);
  const seedChampionshipRoster = useGraphStore((s) => s.seedChampionshipRoster);

  // Keep the graph store's league in sync with the URL so seeded graphs
  // load from the correct dataset when the user clicks through to home.
  useEffect(() => {
    setSelectedLeague(league);
  }, [league, setSelectedLeague]);

  const selectTrade = (trade: TradeWithDetails) => {
    track('seed_graph', { seed_type: 'trade', trade_id: trade.id, source: 'explore-page' });
    seedFromTrade(trade);
    router.push('/');
  };

  const selectPlayer = (name: string) => {
    track('seed_graph', { seed_type: 'player', player_name: name, source: 'explore-page' });
    void seedFromPlayer(name).then(() => router.push('/'));
  };

  const selectChain = (tradeId: string, chainScores?: Record<string, ChainTeamData>) => {
    track('seed_graph', { seed_type: 'chain', trade_id: tradeId, source: 'explore-page' });
    void seedFromChain(tradeId, chainScores).then(() => router.push('/'));
  };

  const selectChampionship = (teamId: string, season: string) => {
    track('seed_graph', { seed_type: 'championship', team_id: teamId, season, source: 'explore-page' });
    void seedChampionshipRoster(teamId, season).then(() => router.push('/'));
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        paddingBottom: 120,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 0' }}>
        <Link
          href="/"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
          }}
        >
          ← NBA Trade Mapper
        </Link>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <DiscoverySection
          league={league}
          singleCategoryId={categoryId}
          onSelectTrade={selectTrade}
          onSelectPlayer={selectPlayer}
          onSelectChain={selectChain}
          onSelectChampionship={selectChampionship}
        />
      </div>
    </div>
  );
}
