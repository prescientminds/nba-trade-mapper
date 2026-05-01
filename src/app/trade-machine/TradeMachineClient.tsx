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
import {
  getCBAEra,
  maxIncomingSalary,
  validatePickRules,
  type PickAsset,
  type TeamPickContext,
} from '@/lib/trade-validation';
import TeamColumn, {
  loadOwnership,
  type BuilderState,
  type OwnedPick,
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
        <LegalitySection left={left} right={right} ownership={ownership} sticky />
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

        <SalaryLedger left={left} right={right} />

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

function evaluateLegality(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
): LegalityVerdict {
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

  // Draft pick rules — Stepien + seven-year cap. Independent of salary
  // matching, so check first; if a pick rule is violated the trade is dead
  // regardless of money.
  const pickRuleResult = checkPickRules(left, right, ownership);
  if (!pickRuleResult.legal) {
    return {
      status: 'illegal',
      reason: pickRuleResult.violations[0].reason,
    };
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

// Build the per-team Stepien context from pick-ownership.json: for each
// team, list every future-draft year where its own 1st is already owed
// elsewhere (excluding picks selected in this trade — validatePickRules
// folds those in itself).
function checkPickRules(
  left: BuilderState,
  right: BuilderState,
  ownership: Record<string, OwnedPick[]> | null,
) {
  if (!left.teamId || !right.teamId) {
    return { legal: true, violations: [] as { reason: string }[] };
  }

  const outgoingByTeam: Record<string, PickAsset[]> = {
    [left.teamId]: left.picks.map((p) => ({
      pick_key: p.pick_key,
      year: p.year,
      round: p.round,
      original_team_id: p.original_team_id,
      asset_class: p.asset_class,
    })),
    [right.teamId]: right.picks.map((p) => ({
      pick_key: p.pick_key,
      year: p.year,
      round: p.round,
      original_team_id: p.original_team_id,
      asset_class: p.asset_class,
    })),
  };

  const teamContexts: Record<string, TeamPickContext> = {};
  for (const teamId of [left.teamId, right.teamId]) {
    teamContexts[teamId] = {
      teamId,
      ownFirstsAlreadyOwed: ownedAwayOwnFirsts(teamId, ownership),
    };
  }

  return validatePickRules(outgoingByTeam, teamContexts, CURRENT_YEAR);
}

// Across the full ownership map, find this team's own future 1sts that
// some other team currently owns OUTRIGHT (not as a swap right). A swap
// right doesn't transfer the underlying pick — the original team still
// drafts unless the swap is exercised — so swap-class entries don't
// count against Stepien.
function ownedAwayOwnFirsts(
  teamId: string,
  ownership: Record<string, OwnedPick[]> | null,
): number[] {
  if (!ownership) return [];
  const years = new Set<number>();
  for (const picks of Object.values(ownership)) {
    for (const p of picks) {
      if (
        p.round === 1 &&
        p.original_team_id === teamId &&
        p.current_owner_team_id !== teamId &&
        p.asset_class === 'pick' &&
        p.year >= CURRENT_YEAR
      ) {
        years.add(p.year);
      }
    }
  }
  return [...years];
}

function fmtM(dollars: number): string {
  return `${(dollars / 1e6).toFixed(1)}M`;
}

// ── Salary Ledger ─────────────────────────────────────────────────
// Shows each side's outgoing salary, the max it can legally take back
// under the 2023 CBA, and what it's actually taking back. Gives the
// user live guidance on whether the trade is balanced before the
// legality verdict flips.

function SalaryLedger({ left, right }: { left: BuilderState; right: BuilderState }) {
  const { total: leftOut, complete: leftComplete } = outgoingSalaryOf(left);
  const { total: rightOut, complete: rightComplete } = outgoingSalaryOf(right);
  const bothTeamsPicked = !!left.teamId && !!right.teamId;
  const bothSendPlayers =
    left.selectedPlayerNames.size > 0 && right.selectedPlayerNames.size > 0;

  if (!bothTeamsPicked || !bothSendPlayers) return null;
  if (!leftComplete || !rightComplete) {
    return (
      <section style={ledgerShell}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Missing 2025-26 salary data for one or more selected players — legality
          check falls back to asset-count only.
        </div>
      </section>
    );
  }

  const era = getCBAEra('2026-02-01');
  const leftMaxIn = maxIncomingSalary(leftOut, era);
  const rightMaxIn = maxIncomingSalary(rightOut, era);

  const leftOk = rightOut <= leftMaxIn;
  const rightOk = leftOut <= rightMaxIn;

  const leftTeamName = left.teamId ? TEAMS[left.teamId]?.name ?? 'Team A' : 'Team A';
  const rightTeamName = right.teamId ? TEAMS[right.teamId]?.name ?? 'Team B' : 'Team B';

  return (
    <section style={ledgerShell}>
      <LedgerRow
        teamName={leftTeamName}
        sends={leftOut}
        maxIn={leftMaxIn}
        actuallyTakes={rightOut}
        ok={leftOk}
      />
      <LedgerRow
        teamName={rightTeamName}
        sends={rightOut}
        maxIn={rightMaxIn}
        actuallyTakes={leftOut}
        ok={rightOk}
      />
    </section>
  );
}

function LedgerRow({
  teamName,
  sends,
  maxIn,
  actuallyTakes,
  ok,
}: {
  teamName: string;
  sends: number;
  maxIn: number;
  actuallyTakes: number;
  ok: boolean;
}) {
  const overshoot = actuallyTakes - maxIn;
  const color = ok ? 'var(--accent-green)' : 'var(--accent-red)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr auto auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 'var(--radius-sm)',
        background: ok ? 'rgba(6,214,160,0.06)' : 'rgba(239,71,111,0.08)',
      }}
    >
      <span style={{ color, fontSize: 14, fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {teamName}
      </span>
      <LedgerStat label="Sends" value={`$${fmtM(sends)}`} />
      <LedgerStat label="Max incoming" value={`$${fmtM(maxIn)}`} />
      <LedgerStat
        label={ok ? 'Taking back' : `Over by $${fmtM(Math.max(0, overshoot))}`}
        value={`$${fmtM(actuallyTakes)}`}
        emphasize={!ok}
      />
    </div>
  );
}

function LedgerStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 90 }}>
      <span
        style={{
          fontSize: 9,
          color: emphasize ? 'var(--accent-red)' : 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}

const ledgerShell: React.CSSProperties = {
  marginTop: 20,
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-subtle)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

function LegalitySection({
  left,
  right,
  ownership,
  sticky = false,
}: {
  left: BuilderState;
  right: BuilderState;
  ownership: Record<string, OwnedPick[]> | null;
  sticky?: boolean;
}) {
  const verdict = evaluateLegality(left, right, ownership);

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
    bg = 'rgba(239, 71, 111, 0.16)';
    border = 'rgba(239, 71, 111, 0.5)';
    color = 'var(--accent-red)';
    label = 'Illegal';
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        ...(sticky
          ? {
              position: 'sticky',
              top: 12,
              zIndex: 5,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }
          : {}),
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color,
          flexShrink: 0,
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
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(comparable.matchScore * 100);
  const factors = comparable.factors;

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{
        padding: 14,
        background: 'var(--bg-card)',
        border: `1px solid ${expanded ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
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

      {/* Always-on factor chips */}
      {factors && <FactorChips factors={factors} />}

      {/* Click-to-expand rationale */}
      {expanded && factors && (
        <ExpandedRationale
          factors={factors}
          outcomeSummary={comparable.outcomeSummary}
          motivation={comparable.motivation}
          tradeId={comparable.id}
        />
      )}

      {!expanded && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          click for details
        </div>
      )}
    </div>
  );
}

function FactorChips({ factors }: { factors: NonNullable<Comparable['factors']> }) {
  const chipStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.04)',
    padding: '2px 7px',
    borderRadius: 999,
    border: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  };
  const bpm = factors.bpmDelta;
  const age = factors.ageDelta;
  const era = factors.eraGap;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      <span style={chipStyle}>
        ΔBPM {bpm == null ? '—' : (Math.abs(bpm) < 0.05 ? '0.0' : bpm.toFixed(1))}
      </span>
      <span style={chipStyle}>
        Δage {age === 0 ? '0' : (age > 0 ? `+${age}` : `${age}`)}y
      </span>
      <span style={chipStyle}>
        {era === 0 ? 'same yr' : `${Math.abs(era)}y era`}
      </span>
    </div>
  );
}

function rationaleSentence(factors: NonNullable<Comparable['factors']>): string {
  const p = factors.proposedAnchor;
  const c = factors.candidateAnchor;
  const bpmPart =
    factors.bpmDelta == null
      ? `${p.name} (age ${p.age}) and ${c.name} (age ${c.age})`
      : `${p.name} (age ${p.age}, ${fmtBpm(p.bpm)} BPM) and ${c.name} (age ${c.age}, ${fmtBpm(c.bpm)} BPM)`;
  const eraAbs = Math.abs(factors.eraGap);
  const eraPart =
    factors.eraGap === 0
      ? 'same era'
      : `${eraAbs} year${eraAbs === 1 ? '' : 's'} ${factors.eraGap > 0 ? 'later' : 'earlier'}`;
  return `Anchors ${bpmPart} — ${eraPart}.`;
}

function fmtBpm(x: number | null): string {
  if (x == null) return '—';
  return x > 0 ? `+${x.toFixed(1)}` : x.toFixed(1);
}

function ExpandedRationale({
  factors,
  outcomeSummary,
  motivation,
  tradeId,
}: {
  factors: NonNullable<Comparable['factors']>;
  outcomeSummary?: string;
  motivation?: string;
  tradeId: string;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 6,
        padding: '10px 12px',
        background: 'rgba(255,107,53,0.05)',
        border: '1px solid rgba(255,107,53,0.2)',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--accent-orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Why this match
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {rationaleSentence(factors)}
      </div>

      {outcomeSummary && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            paddingTop: 6,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Outcome:</span>
          {outcomeSummary}
        </div>
      )}

      {motivation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Tagged:
          </span>
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--accent-purple)',
              padding: '2px 7px',
              borderRadius: 999,
              background: 'rgba(155, 93, 229, 0.12)',
              border: '1px solid rgba(155, 93, 229, 0.3)',
            }}
          >
            {motivation.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      <a
        href={`/?t=${tradeId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          color: 'var(--accent-orange)',
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        Open this trade in the graph →
      </a>
    </div>
  );
}
