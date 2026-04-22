'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { TEAMS } from '@/lib/teams';
import {
  findComparables,
  type Comparable,
  type PlayerProfile,
  type TeamSide,
  type TradeProfile,
} from '@/lib/comparables';
import { getCBAEra, maxIncomingSalary } from '@/lib/trade-validation';
import TeamColumn, {
  type BuilderState,
} from './TeamColumn';

const CURRENT_SEASON = '2025-26';
const CURRENT_YEAR = 2026;
// v1 scope: 2 teams, current season only. Multi-team + historical seasons in v2.

export default function TradeMachineClient() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from');
  const initialLeft = fromParam && TEAMS[fromParam] ? fromParam : null;

  const [left, setLeft] = useState<BuilderState>(() => emptyState(initialLeft));
  const [right, setRight] = useState<BuilderState>(() => emptyState(null));

  const [salaryCap, setSalaryCap] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TradeProfile[] | null>(null);

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            marginTop: 20,
          }}
        >
          <TeamColumn
            label="Team A"
            state={left}
            otherTeamId={right.teamId}
            onChange={setLeft}
          />
          <TeamColumn
            label="Team B"
            state={right}
            otherTeamId={left.teamId}
            onChange={setRight}
          />
        </div>

        <LegalitySection left={left} right={right} />

        <ComparablesSection
          left={left}
          right={right}
          salaryCap={salaryCap}
          candidates={candidates}
        />
      </div>
    </div>
  );
}

function emptyState(teamId: string | null): BuilderState {
  return {
    teamId,
    roster: [],
    selectedPlayerNames: new Set(),
    picks: [],
  };
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

// ── Helpers that work against BuilderState ─────────────────────────

function outgoingPlayersOf(state: BuilderState) {
  return state.roster.filter((r) => state.selectedPlayerNames.has(r.player_name));
}

function outgoingSalaryOf(state: BuilderState): { total: number; complete: boolean } {
  const outgoing = outgoingPlayersOf(state);
  let total = 0;
  let complete = outgoing.length > 0;
  for (const p of outgoing) {
    if (p.salary != null) total += p.salary;
    else complete = false;
  }
  return { total, complete };
}

// ── Legality ───────────────────────────────────────────────────────

interface LegalityVerdict {
  status: 'legal' | 'illegal' | 'incomplete';
  reason: string;
}

function evaluateLegality(left: BuilderState, right: BuilderState): LegalityVerdict {
  if (!left.teamId || !right.teamId) {
    return { status: 'incomplete', reason: 'Pick a team on each side' };
  }
  if (left.teamId === right.teamId) {
    return { status: 'illegal', reason: 'Both sides are the same team' };
  }
  const leftAssetCount = left.selectedPlayerNames.size + left.picks.length;
  const rightAssetCount = right.selectedPlayerNames.size + right.picks.length;
  if (leftAssetCount === 0 || rightAssetCount === 0) {
    return { status: 'incomplete', reason: 'Each side must send at least one asset' };
  }

  const { total: leftSalary, complete: leftComplete } = outgoingSalaryOf(left);
  const { total: rightSalary, complete: rightComplete } = outgoingSalaryOf(right);
  const bothHaveSalary =
    leftComplete && rightComplete &&
    left.selectedPlayerNames.size > 0 && right.selectedPlayerNames.size > 0;

  // CBA matching check — assumes both teams are over the cap, which is the
  // conservative call. Under-cap absorptions would also pass this gate.
  if (bothHaveSalary) {
    const era = getCBAEra('2026-02-01'); // 2025-26 mid-season → 2023 CBA
    const leftMaxIn = maxIncomingSalary(leftSalary, era);
    const rightMaxIn = maxIncomingSalary(rightSalary, era);
    if (rightSalary > leftMaxIn) {
      return {
        status: 'illegal',
        reason: `Team A sends $${fmtM(leftSalary)} but would take back $${fmtM(rightSalary)} (cap allows $${fmtM(leftMaxIn)})`,
      };
    }
    if (leftSalary > rightMaxIn) {
      return {
        status: 'illegal',
        reason: `Team B sends $${fmtM(rightSalary)} but would take back $${fmtM(leftSalary)} (cap allows $${fmtM(rightMaxIn)})`,
      };
    }
    return { status: 'legal', reason: `Trade meets 2023 CBA matching rules (sending $${fmtM(leftSalary)} / $${fmtM(rightSalary)})` };
  }

  return { status: 'legal', reason: 'Trade has assets on both sides' };
}

function fmtM(dollars: number): string {
  return `${(dollars / 1e6).toFixed(1)}M`;
}

function LegalitySection({
  left,
  right,
}: {
  left: BuilderState;
  right: BuilderState;
}) {
  const verdict = evaluateLegality(left, right);

  let bg = 'rgba(255, 255, 255, 0.04)';
  let border = 'var(--border-subtle)';
  let color = 'var(--text-tertiary)';
  let label = 'Incomplete';
  if (verdict.status === 'legal') {
    bg = 'rgba(6, 214, 160, 0.12)';
    border = 'rgba(6, 214, 160, 0.35)';
    color = 'var(--accent-green)';
    label = 'Legal';
  } else if (verdict.status === 'illegal') {
    bg = 'rgba(239, 71, 111, 0.12)';
    border = 'rgba(239, 71, 111, 0.35)';
    color = 'var(--accent-red)';
    label = 'Illegal';
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          letterSpacing: '0.05em',
          color,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {verdict.reason}
      </div>
    </section>
  );
}

// ── Comparables ────────────────────────────────────────────────────

function buildProposedProfile(
  left: BuilderState,
  right: BuilderState,
  salaryCap: number | null,
): TradeProfile | null {
  if (!left.teamId || !right.teamId) return null;
  if (left.teamId === right.teamId) return null;
  const leftSide = toSide(left, salaryCap);
  const rightSide = toSide(right, salaryCap);
  if (!leftSide || !rightSide) return null;
  if (leftSide.players.length + leftSide.pickCount === 0) return null;
  if (rightSide.players.length + rightSide.pickCount === 0) return null;
  return {
    id: `proposed-${Date.now()}`,
    year: CURRENT_YEAR,
    sides: [leftSide, rightSide],
    // motivation undefined on purpose — user-built trades aren't hand-tagged
  };
}

function toSide(state: BuilderState, salaryCap: number | null): TeamSide | null {
  if (!state.teamId) return null;
  const outgoing = outgoingPlayersOf(state);
  const players: PlayerProfile[] = outgoing.map((p) => ({
    name: p.player_name,
    age: p.age ?? 0,
    bpm: p.bpm,
    contractYearsRemaining: p.contractYearsRemaining,
    capPct: p.salary != null && salaryCap ? p.salary / salaryCap : null,
  }));
  return {
    teamId: state.teamId,
    players,
    pickCount: state.picks.length,
  };
}

function ComparablesSection({
  left,
  right,
  salaryCap,
  candidates,
}: {
  left: BuilderState;
  right: BuilderState;
  salaryCap: number | null;
  candidates: TradeProfile[] | null;
}) {
  const proposed = useMemo(
    () => buildProposedProfile(left, right, salaryCap),
    [left, right, salaryCap],
  );

  const candidateLookup = useMemo(() => {
    const m = new Map<string, TradeProfile>();
    if (candidates) for (const c of candidates) m.set(c.id, c);
    return m;
  }, [candidates]);

  const results: Comparable[] = useMemo(() => {
    if (!proposed || !candidates) return [];
    return findComparables(proposed, candidates, { topN: 5 });
  }, [proposed, candidates]);

  return (
    <section style={{ marginTop: 28 }}>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          letterSpacing: '0.04em',
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}
      >
        Historical Comparables
      </h2>
      {!candidates && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Loading historical trades…
        </div>
      )}
      {candidates && !proposed && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          Build a trade on both sides to see its five closest historical matches.
        </div>
      )}
      {candidates && proposed && results.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          No comparables — try adjusting the players involved.
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
        }}
      >
        {results.map((c) => (
          <ComparableCard
            key={c.id}
            comparable={c}
            year={candidateLookup.get(c.id)?.year ?? null}
          />
        ))}
      </div>
    </section>
  );
}

function ComparableCard({ comparable, year }: { comparable: Comparable; year: number | null }) {
  const pct = Math.round(comparable.matchScore * 100);
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {comparable.headline ?? comparable.id}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--accent-blue)',
            whiteSpace: 'nowrap',
          }}
        >
          {pct}% match
        </div>
      </div>
      {year != null && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {year - 1}-{String(year).slice(-2)}
        </div>
      )}
      {comparable.outcomeSummary && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {comparable.outcomeSummary}
        </div>
      )}
      {comparable.motivation && (
        <div
          style={{
            alignSelf: 'flex-start',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--accent-purple)',
            padding: '3px 7px',
            borderRadius: 999,
            background: 'rgba(155, 93, 229, 0.12)',
            border: '1px solid rgba(155, 93, 229, 0.3)',
          }}
        >
          {comparable.motivation.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  );
}
