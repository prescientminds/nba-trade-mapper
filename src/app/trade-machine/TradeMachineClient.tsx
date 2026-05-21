'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { TEAMS } from '@/lib/teams';
import { type TradeProfile } from '@/lib/comparables';
import {
  CURRENT_SEASON,
  emptyState,
  loadOwnership,
  type BuilderState,
  type OwnedPick,
} from '@/lib/trade-builder';
import TeamColumn from './TeamColumn';
import SalaryLedger from './SalaryLedger';
import LegalitySection from './LegalitySection';
import ComparablesSection from './ComparablesSection';

export default function TradeMachineClient() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');
  const initialLeft = fromParam && TEAMS[fromParam] ? fromParam : null;

  const [left, setLeft] = useState<BuilderState>(() => emptyState(initialLeft));
  const [right, setRight] = useState<BuilderState>(() => emptyState(null));

  const [salaryCap, setSalaryCap] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TradeProfile[] | null>(null);
  const [ownership, setOwnership] = useState<Record<string, OwnedPick[]> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadOwnership().then((o) => {
      if (!cancelled) setOwnership(o);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/data/trade-profiles.json');
        const json = (await res.json()) as TradeProfile[];
        if (cancelled) return;
        setCandidates(json);
      } catch (e) {
        console.error('Failed to load trade-profiles.json', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      const { data } = await sb
        .from('salary_cap_history')
        .select('salary_cap')
        .eq('season', CURRENT_SEASON)
        .limit(1) as unknown as { data: { salary_cap: number | null }[] | null };
      if (cancelled) return;
      if (data?.[0]?.salary_cap) setSalaryCap(data[0].salary_cap);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg-primary)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--bg-tertiary) transparent',
      }}
    >
      <TopNav />
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '24px 20px 120px',
          fontFamily: 'var(--font-body)',
        }}
      >
        <Heading />
        <LegalitySection slots={[left, right]} ownership={ownership} sticky />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            marginTop: 16,
          }}
        >
          <TeamColumn
            label="Team A"
            state={left}
            otherTeamIds={right.teamId ? [right.teamId] : []}
            allTeamIds={[left.teamId, right.teamId].filter((t): t is string => !!t)}
            onChange={setLeft}
          />
          <TeamColumn
            label="Team B"
            state={right}
            otherTeamIds={left.teamId ? [left.teamId] : []}
            allTeamIds={[left.teamId, right.teamId].filter((t): t is string => !!t)}
            onChange={setRight}
          />
        </div>

        <SalaryLedger slots={[left, right]} />

        <ComparablesSection
          slots={[left, right]}
          salaryCap={salaryCap}
          candidates={candidates}
        />
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────

function TopNav() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(10, 10, 15, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Link
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--accent-orange)',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Trade Mapper
      </Link>
    </nav>
  );
}

function Heading() {
  return (
    <header>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 42,
          letterSpacing: '0.02em',
          color: 'var(--text-primary)',
          margin: 0,
        }}
      >
        Trade Machine
      </h1>
      <p
        style={{
          fontSize: 14,
          color: 'var(--text-tertiary)',
          marginTop: 8,
          maxWidth: 620,
          lineHeight: 1.6,
        }}
      >
        Build a hypothetical trade between two current-season rosters. We
        surface the five historical deals that most resemble it on profile —
        BPM, age, contract years, cap share.
      </p>
    </header>
  );
}
