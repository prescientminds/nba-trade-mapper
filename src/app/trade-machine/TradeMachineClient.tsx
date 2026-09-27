'use client';

/**
 * Trade Machine — the full-page builder.
 *
 * Layout, top to bottom:
 *   1. Pinned trade bar: verdict (LEGAL / ILLEGAL + reason) and actions —
 *      add a team, Share (image), View on canvas.
 *   2. Pinned team row: one header per team, side by side — the team picker,
 *      what that team gets, and salary in/out. Always visible while scrolling.
 *   3. Columns: every team's full roster and pick war chest at once, aligned
 *      under its header. On phones with 3–4 teams the columns swipe sideways
 *      and the header row follows.
 *   4. Salary ledger and the five closest historical comparables.
 *
 * The trade lives in the URL (`?t=`), so refresh and back/forward keep it.
 * `?node=<id>` means we came from a canvas card: View on canvas writes the
 * edits back to that card. `?from=<teamId>` pre-picks Team 1.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { TEAMS } from '@/lib/teams';
import { type Comparable, type TradeProfile } from '@/lib/comparables';
import { useGraphStore, type HypotheticalTradeNodeData } from '@/lib/graph-store';
import { createHypotheticalShareLinkFromSides } from '@/lib/share';
import {
  CURRENT_SEASON,
  MAX_TEAMS_PER_TRADE,
  emptyState,
  fmtM,
  loadOwnership,
  type BuilderState,
  type LegalityVerdict,
  type OwnedPick,
} from '@/lib/trade-builder';
import {
  SLOT_LABELS,
  computeLedgerRows,
  decodeSides,
  displayVerdict,
  encodeSides,
  hydrateSide,
  pickLabel,
  resolveDecoded,
  slotsToSides,
  type DecodedSide,
} from '@/lib/hypothetical-sides';
import TradeCard, { verdictStyle } from '@/components/TradeCard';
import HypotheticalShareSheet from '@/components/HypotheticalShareSheet';
import TeamColumn, { TeamPicker } from './TeamColumn';
import SalaryLedger from './SalaryLedger';
import ComparablesSection from './ComparablesSection';

const PAGE_BG = '#0a0a0f';

function useViewportWidth(): number {
  const [w, setW] = useState(1280);
  useEffect(() => {
    const read = () => setW(window.innerWidth);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return w;
}

export default function TradeMachineClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get('node');
  const width = useViewportWidth();
  const compact = width < 700;

  // ── Initial state: canvas node → URL → ?from= → empty ──────────
  const [pendingPicks, setPendingPicks] = useState<DecodedSide[] | null>(null);
  const [slots, setSlots] = useState<BuilderState[]>(() => {
    if (nodeParam) {
      const node = useGraphStore.getState().nodes.find(
        (n) => n.id === nodeParam && n.type === 'hypotheticalTrade',
      );
      const sides = (node?.data as HypotheticalTradeNodeData | undefined)?.sides;
      if (sides && sides.length >= 2) return sides.map(hydrateSide);
    }
    const decoded = decodeSides(searchParams.get('t'));
    if (decoded && decoded.length >= 2) {
      // Players hydrate now; picks need the ownership table (see below).
      return decoded.map((d) => hydrateSide({ teamId: d.teamId, playerNames: d.players, picks: [] }));
    }
    const from = searchParams.get('from');
    return [emptyState(from && TEAMS[from] ? from : null), emptyState(null)];
  });

  const [ownership, setOwnership] = useState<Record<string, OwnedPick[]> | null>(null);
  const [salaryCap, setSalaryCap] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TradeProfile[] | null>(null);
  const [comparables, setComparables] = useState<Comparable[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  // Picks carried in the URL resolve once ownership loads.
  useEffect(() => {
    if (nodeParam) return;
    const decoded = decodeSides(searchParams.get('t'));
    if (decoded?.some((d) => d.picks.length > 0)) setPendingPicks(decoded);
    // Initial read only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadOwnership().then((o) => { if (!cancelled) setOwnership(o); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ownership || !pendingPicks) return;
    const resolved = resolveDecoded(pendingPicks, ownership);
    setSlots((prev) => prev.map((slot, i) => {
      const side = resolved[i];
      if (!side || side.picks.length === 0) return slot;
      return {
        ...slot,
        picks: side.picks.map(({ toTeamId: _t, ...p }) => p),
        pickDestinations: new Map(side.picks.map((p) => [p.pick_key, p.toTeamId])),
      };
    }));
    setPendingPicks(null);
  }, [ownership, pendingPicks]);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/trade-profiles.json')
      .then((r) => r.json() as Promise<TradeProfile[]>)
      .then((json) => { if (!cancelled) setCandidates(json); })
      .catch((e) => console.error('Failed to load trade-profiles.json', e));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase()
        .from('salary_cap_history')
        .select('salary_cap')
        .eq('season', CURRENT_SEASON)
        .limit(1) as unknown as { data: { salary_cap: number | null }[] | null };
      if (!cancelled && data?.[0]?.salary_cap) setSalaryCap(data[0].salary_cap);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Derived ────────────────────────────────────────────────────
  const sides = useMemo(() => slotsToSides(slots), [slots]);
  const ledger = useMemo(() => computeLedgerRows(sides), [sides]);
  const rostersReady = slots.every((s) => !s.teamId || s.roster.length > 0);
  const verdict: LegalityVerdict = useMemo(() => {
    if (!rostersReady) return { status: 'incomplete', reason: 'Loading rosters…' };
    return displayVerdict(slots, ownership);
  }, [slots, ownership, rostersReady]);
  const teamIds = slots.map((s) => s.teamId).filter((t): t is string => !!t);
  const teamColors = teamIds.map((t) => TEAMS[t]?.color ?? '#666');
  const hasAnyAssets = sides.some((s) => s.playerNames.length > 0 || s.picks.length > 0);

  // Salary in/out per slot. In = players other teams route to this one.
  const salaryFlow = useMemo(() => {
    const salaryOf = new Map<string, number>();
    for (const s of slots) for (const p of s.roster) if (p.salary != null) salaryOf.set(p.player_name, p.salary);
    return slots.map((slot, i) => {
      const out = [...slot.selectedPlayerNames].reduce((t, n) => t + (salaryOf.get(n) ?? 0), 0);
      const inn = sides.reduce((t, side, j) => {
        if (j === i || !slot.teamId) return t;
        return t + side.playerNames
          .filter((p) => p.toTeamId === slot.teamId)
          .reduce((a, p) => a + (salaryOf.get(p.name) ?? 0), 0);
      }, 0);
      return { in: inn, out };
    });
  }, [slots, sides]);

  // Keep the trade in the URL.
  useEffect(() => {
    if (pendingPicks) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('from');
    if (teamIds.length > 0) params.set('t', encodeSides(sides));
    else params.delete('t');
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [sides, teamIds.length, pendingPicks]);

  // ── Actions ────────────────────────────────────────────────────
  const onSlotChange = (idx: number) => (next: BuilderState) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? next : s)));

  // Going from 2 to 3 teams: the 2-team "goes to the other side" default
  // becomes an explicit destination, so assets already picked stay routed.
  const addTeam = () =>
    setSlots((prev) => {
      if (prev.length >= MAX_TEAMS_PER_TRADE) return prev;
      const routed = slotsToSides(prev);
      return [
        ...prev.map((s, i) => ({
          ...s,
          playerDestinations: new Map(routed[i].playerNames.map((p) => [p.name, p.toTeamId])),
          pickDestinations: new Map(routed[i].picks.map((p) => [p.pick_key, p.toTeamId])),
        })),
        emptyState(null),
      ];
    });

  const removeTeam = (idx: number) =>
    setSlots((prev) => {
      if (prev.length <= 2) return prev;
      const gone = prev[idx].teamId;
      // Assets routed to the removed team fall back to unrouted.
      return prev.filter((_, i) => i !== idx).map((s) => ({
        ...s,
        playerDestinations: new Map([...s.playerDestinations].map(([k, v]) => [k, v === gone ? null : v])),
        pickDestinations: new Map([...s.pickDestinations].map(([k, v]) => [k, v === gone ? null : v])),
      }));
    });

  const viewOnCanvas = async () => {
    const store = useGraphStore.getState();
    const existing = nodeParam && store.nodes.some((n) => n.id === nodeParam && n.type === 'hypotheticalTrade');
    const nodeId = existing ? nodeParam! : store.addHypotheticalTrade(teamIds);
    store.updateHypotheticalTrade(nodeId, sides);
    store.setHypotheticalVerdict(nodeId, verdict);
    store.setHypotheticalWritingNode(null);
    if (comparables.length > 0) {
      store.setLatestComparables(nodeId, comparables);
      await store.visualizeHypothetical(nodeId);
    }
    router.push('/');
  };

  const onComparables = useCallback((r: Comparable[]) => setComparables(r), []);

  // ── Horizontal sync: header row follows the columns on phones ──
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const onBodyScroll = () => {
    if (headerTrackRef.current && bodyScrollRef.current) {
      headerTrackRef.current.style.transform = `translateX(${-bodyScrollRef.current.scrollLeft}px)`;
    }
  };

  // Phones with 3+ teams: a bit wider so the inline "→ team" menu fits.
  const colMin = compact ? (slots.length >= 3 ? 220 : 168) : 260;
  const gap = compact ? 6 : 12;
  const canAdd = slots.length < MAX_TEAMS_PER_TRADE;
  const addReady = slots.slice(0, 2).every((s) => !!s.teamId);
  // Desktop: "+ Add team" is a narrow slot at the end of the team row, with
  // a matching empty track under it so headers and columns stay aligned.
  const addTrack = canAdd && !compact ? ' 150px' : '';
  const gridTemplateColumns = `repeat(${slots.length}, minmax(${colMin}px, 1fr))${addTrack}`;
  const maxWidth = [0, 0, 1180, 1480, 1760][slots.length];
  const sidePad = compact ? 8 : 20;
  const vs = verdictStyle(verdict.status);

  return (
    <div
      data-trade-machine-page
      style={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: PAGE_BG,
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* ── Pinned: trade bar + team headers ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: PAGE_BG,
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ maxWidth, margin: '0 auto', padding: `10px ${sidePad}px 0` }}>
          {/* Trade bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 12 }}>
            <Link
              href="/"
              aria-label="Back to Trade Mapper"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--accent-orange)',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              {!compact && (
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                  Trade Machine
                </span>
              )}
            </Link>

            {/* Verdict stamp — solid color, fixed spot at the head of the
                bar, so legal-or-not reads at a glance. Reason sits beside it. */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: compact ? 8 : 12,
              }}
            >
              <span
                data-page-verdict={verdict.status}
                aria-live="polite"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: compact ? '5px 10px' : '6px 14px',
                  borderRadius: 6,
                  fontFamily: 'var(--font-display)',
                  fontSize: compact ? 17 : 22,
                  letterSpacing: '0.06em',
                  lineHeight: 1,
                  ...STAMP[verdict.status],
                }}
              >
                <span aria-hidden>{STAMP_ICON[verdict.status]}</span>
                {vs.label}
              </span>
              <span
                title={verdict.reason}
                style={{
                  minWidth: 0,
                  fontSize: compact ? 11 : 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {verdict.reason}
              </span>
            </div>

            {compact && canAdd && (
              <button
                type="button"
                onClick={addTeam}
                disabled={!addReady}
                data-add-team
                aria-label="Add a team"
                style={{ ...secondaryBtn(addReady, true), padding: '8px 10px' }}
              >
                + Team
              </button>
            )}
            {!compact && (
              <button type="button" onClick={viewOnCanvas} disabled={teamIds.length === 0} style={secondaryBtn(teamIds.length > 0)}>
                View on canvas
              </button>
            )}
            <HypotheticalShareSheet
              fileStem={teamIds.join('-') || 'trade'}
              cardRef={cardRef}
              enabled={hasAnyAssets}
              comparableCount={comparables.length}
              accent={teamColors[0] ?? '#ff6b35'}
              createLink={() => createHypotheticalShareLinkFromSides(sides, comparables, verdict)}
              source="trade_machine_page"
              variant="button"
            />
          </div>

          {/* Team header row — clipped track, translated to follow the columns */}
          <div style={{ overflow: 'hidden', marginTop: 10 }}>
            <div
              ref={headerTrackRef}
              style={{ display: 'grid', gridTemplateColumns, gap, willChange: 'transform' }}
            >
              {slots.map((slot, idx) => {
                const row = ledger.find((r) => r.teamId === slot.teamId);
                const gets = row ? [...row.players, ...row.picks.map(pickLabel)] : [];
                const team = slot.teamId ? TEAMS[slot.teamId] : null;
                const flow = salaryFlow[idx];
                return (
                  <div
                    key={idx}
                    data-team-header={idx}
                    style={{
                      padding: '0 0 10px',
                      borderBottom: `3px solid ${team?.color ?? 'var(--border-medium)'}`,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TeamPicker
                        value={slot.teamId}
                        otherTeamIds={slots.filter((_, i) => i !== idx).map((s) => s.teamId).filter((t): t is string => !!t)}
                        onChange={(v) => onSlotChange(idx)({ ...slot, teamId: v, roster: [], selectedPlayerNames: new Set(), picks: [] })}
                      />
                      {idx >= 2 && (
                        <button
                          type="button"
                          onClick={() => removeTeam(idx)}
                          aria-label={`Remove ${team?.name ?? SLOT_LABELS[idx]}`}
                          title="Remove this team"
                          style={{
                            width: 30,
                            height: 30,
                            flexShrink: 0,
                            borderRadius: 6,
                            border: 'none',
                            background: 'rgba(255,255,255,0.08)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: compact ? 11 : 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.35,
                        minHeight: compact ? 30 : 16,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: compact ? 2 : 1,
                        WebkitBoxOrient: 'vertical',
                      }}
                      title={gets.join(', ')}
                    >
                      {!slot.teamId ? (
                        <span style={{ color: 'var(--text-muted)' }}>Pick a team</span>
                      ) : gets.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>Gets nothing yet</span>
                      ) : (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>Gets </span>
                          <span style={{ color: 'var(--text-primary)' }}>{gets.join(', ')}</span>
                        </>
                      )}
                    </div>
                    {slot.teamId && (flow.in > 0 || flow.out > 0) && (
                      <div style={{ marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: compact ? 10 : 11, color: 'var(--text-muted)' }}>
                        in <span style={{ color: 'var(--text-primary)' }}>${fmtM(flow.in)}</span>
                        {' · '}out <span style={{ color: 'var(--text-primary)' }}>${fmtM(flow.out)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {addTrack && (
                <button
                  type="button"
                  onClick={addTeam}
                  disabled={!addReady}
                  data-add-team
                  title={addReady ? undefined : 'Pick the first two teams first'}
                  style={{ ...secondaryBtn(addReady, true), alignSelf: 'start', height: 36, padding: '0 10px' }}
                >
                  + Add team
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Columns: every roster and pick at once ── */}
      <div style={{ maxWidth, margin: '0 auto', padding: `12px ${sidePad}px 0` }}>
        <div
          ref={bodyScrollRef}
          onScroll={onBodyScroll}
          data-columns-scroller
          style={{
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollSnapType: compact ? 'x mandatory' : undefined,
            scrollbarWidth: 'none',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns, gap, alignItems: 'start' }}>
            {slots.map((slot, idx) => (
              <div key={idx} data-trade-slot={idx} style={{ minWidth: 0, scrollSnapAlign: 'start' }}>
                <TeamColumn
                  label={SLOT_LABELS[idx]}
                  state={slot}
                  otherTeamIds={slots.filter((_, i) => i !== idx).map((s) => s.teamId).filter((t): t is string => !!t)}
                  allTeamIds={teamIds}
                  onChange={onSlotChange(idx)}
                  hideHeader
                  compact={compact}
                />
              </div>
            ))}
            {addTrack && <div aria-hidden />}
          </div>
        </div>
      </div>

      {/* ── Below: ledger + comparables ── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 ${sidePad}px 120px` }}>
        <SalaryLedger slots={slots} />
        <ComparablesSection
          slots={slots}
          salaryCap={salaryCap}
          candidates={candidates}
          onResultsChange={onComparables}
        />
        {compact && teamIds.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
            <button type="button" onClick={viewOnCanvas} style={secondaryBtn(true)}>
              View on canvas
            </button>
          </div>
        )}
      </div>

      {/* The card the share image is made from (captured, never shown). */}
      <div aria-hidden style={{ display: 'none' }}>
        <TradeCard
          cardRef={cardRef}
          teamIds={teamIds}
          teamColors={teamColors}
          sides={sides}
          verdict={verdict}
          width={240}
        />
      </div>
    </div>
  );
}

const STAMP: Record<LegalityVerdict['status'], React.CSSProperties> = {
  legal: { background: 'var(--accent-green)', color: '#04140e' },
  illegal: { background: 'var(--accent-red)', color: '#fff' },
  incomplete: { background: 'rgba(255,255,255,0.08)', color: 'var(--text-tertiary)', border: '1px dashed var(--border-medium)' },
};
const STAMP_ICON: Record<LegalityVerdict['status'], string> = { legal: '✓', illegal: '✕', incomplete: '…' };

function secondaryBtn(enabled: boolean, dashed = false): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 8,
    border: `1px ${dashed ? 'dashed' : 'solid'} ${enabled ? 'rgba(255, 107, 53, 0.6)' : 'var(--border-subtle)'}`,
    background: enabled ? 'rgba(255, 107, 53, 0.08)' : 'transparent',
    color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };
}
