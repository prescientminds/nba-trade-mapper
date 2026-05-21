'use client';

/**
 * Phase B — canvas-native Trade Machine side panel.
 *
 * Docked-right editor for the hypothetical-trade node bound to the store's
 * `hypotheticalWritingNodeId`. The node's `data.sides` is the durable edit
 * intent (team + selected player names + picks); this panel hydrates an
 * N-length working `BuilderState[]` from it, lets each `TeamColumn` refetch
 * its roster from the team id, and persists the intent back via
 * `updateHypotheticalTrade` on every change.
 *
 * Hydration is keyed on `hypotheticalWritingNodeId` only (read imperatively
 * via getState), NOT the node object — otherwise persisting would re-trigger
 * hydration and clobber the working roster on every keystroke.
 *
 * v1 supports 2 or 3 teams (hard cap MAX_TEAMS_PER_TRADE = 3). The "Add
 * team" button appears below the 2nd team column once both teams are
 * picked. CBA salary matching for 3-team trades is deferred (per-asset
 * routing not modeled yet); Stepien + 7-year cap fire per team.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMobile } from '@/lib/use-mobile';
import {
  useGraphStore,
  HypotheticalTradeNodeData,
  HypotheticalSide,
  liftHypotheticalSide,
} from '@/lib/graph-store';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { getSupabase } from '@/lib/supabase';
import { type TradeProfile } from '@/lib/comparables';
import {
  CURRENT_SEASON,
  MAX_TEAMS_PER_TRADE,
  loadOwnership,
  emptyState,
  type BuilderState,
  type OwnedPick,
} from '@/lib/trade-builder';
import TeamColumn from '@/app/trade-machine/TeamColumn';
import SalaryLedger from '@/app/trade-machine/SalaryLedger';
import LegalitySection from '@/app/trade-machine/LegalitySection';
import ComparablesSection from '@/app/trade-machine/ComparablesSection';

const ACCENT = '#ff6b35';

function hydrateSide(side: HypotheticalSide | undefined): BuilderState {
  if (!side) return emptyState(null);
  // Lift defends against legacy serialized shares with `playerNames: string[]`
  // — the toTeamId field is added with `null` so the panel can default it.
  const lifted = liftHypotheticalSide(side);
  return {
    teamId: lifted.teamId,
    roster: [],
    selectedPlayerNames: new Set(lifted.playerNames.map((p) => p.name)),
    picks: lifted.picks.map(({ toTeamId: _t, ...pick }) => pick),
    playerDestinations: new Map(lifted.playerNames.map((p) => [p.name, p.toTeamId])),
    pickDestinations: new Map(lifted.picks.map((p) => [p.pick_key, p.toTeamId])),
  };
}

/**
 * Persist a BuilderState back into the durable HypotheticalSide shape.
 * In 2-team mode, the destination is unambiguous — fill `toTeamId` with the
 * other side's team id automatically (or `null` if the other side hasn't
 * picked a team yet). In 3+/4-team mode the user's explicit choice is
 * preserved; unrouted assets keep `toTeamId: null` until the dropdown is
 * exercised.
 */
function toSide(state: BuilderState, allTeamIds: Array<string | null>, selfIdx: number): HypotheticalSide {
  const otherTeamIds = allTeamIds.filter((_, i) => i !== selfIdx);
  const filledOthers = otherTeamIds.filter((t): t is string => !!t);
  const isTwoTeam = allTeamIds.length === 2;
  const defaultDest = isTwoTeam ? filledOthers[0] ?? null : null;

  const playerNames = [...state.selectedPlayerNames].map((name) => ({
    name,
    toTeamId: state.playerDestinations.get(name) ?? defaultDest,
  }));
  const picks = state.picks.map((p) => ({
    ...p,
    toTeamId: state.pickDestinations.get(p.pick_key) ?? defaultDest,
  }));
  return { teamId: state.teamId, playerNames, picks };
}

const SLOT_LABELS = ['Team A', 'Team B', 'Team C', 'Team D'];

export default function TradeMachineSidePanel() {
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const node = useGraphStore((s) =>
    s.nodes.find((n) => n.id === s.hypotheticalWritingNodeId),
  );
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const updateHypotheticalTrade = useGraphStore((s) => s.updateHypotheticalTrade);
  const setLatestComparables = useGraphStore((s) => s.setLatestComparables);
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);

  const [ownership, setOwnership] = useState<Record<string, OwnedPick[]> | null>(null);
  const [salaryCap, setSalaryCap] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TradeProfile[] | null>(null);
  const [slots, setSlots] = useState<BuilderState[]>(() => [emptyState(null), emptyState(null)]);

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

  // Hydrate the working state when the edit target changes. Read the node
  // imperatively so this does not re-run when we persist back into it.
  useEffect(() => {
    if (!writingNodeId) return;
    const n = useGraphStore
      .getState()
      .nodes.find((x) => x.id === writingNodeId);
    if (!n || n.type !== 'hypotheticalTrade') return;
    const sides = (n.data as HypotheticalTradeNodeData).sides ?? [];
    // Always render at least 2 slots — addHypotheticalTrade seeds 2, but a
    // safety pad here protects against malformed fixtures.
    const padded = sides.length >= 2 ? sides : [...sides, ...Array(2 - sides.length).fill(undefined)];
    setSlots(padded.map(hydrateSide));
  }, [writingNodeId]);

  // Persist intent back onto the node. Called from each column's onChange
  // handler with the full updated slot list so there is no stale-closure window.
  // toSide is called with the full slot teamId list so 2-team trades can
  // default each asset's destination to the other side.
  const persist = useRef<(next: BuilderState[]) => void>(() => {});
  persist.current = (next) => {
    if (!writingNodeId) return;
    const allTeamIds = next.map((s) => s.teamId);
    updateHypotheticalTrade(
      writingNodeId,
      next.map((slot, idx) => toSide(slot, allTeamIds, idx)),
    );
  };

  // Publish the side panel's latest top-5 to the store, keyed by the editing
  // node id, so the node-side Visualize button can fire without recomputing.
  // useCallback keeps the identity stable across renders so ComparablesSection's
  // effect doesn't re-fire on every parent render.
  const onComparablesChange = useCallback(
    (results: Parameters<typeof setLatestComparables>[1]) => {
      if (!writingNodeId) return;
      setLatestComparables(writingNodeId, results);
    },
    [writingNodeId, setLatestComparables],
  );

  const onSlotChange = (idx: number) => (next: BuilderState) => {
    const updated = slots.map((s, i) => (i === idx ? next : s));
    setSlots(updated);
    persist.current(updated);
  };

  const onAddTeam = () => {
    if (slots.length >= MAX_TEAMS_PER_TRADE) return;
    const updated = [...slots, emptyState(null)];
    setSlots(updated);
    persist.current(updated);
  };

  const onRemoveSlot = (idx: number) => () => {
    if (slots.length <= 2) return;
    const updated = slots.filter((_, i) => i !== idx);
    setSlots(updated);
    persist.current(updated);
  };

  if (!writingNodeId || !node || node.type !== 'hypotheticalTrade') return null;

  const { teamColors } = node.data as HypotheticalTradeNodeData;
  const primaryColor = teamColors[0] || ACCENT;

  // Scroll a specific TeamColumn into view when its header chip is clicked.
  // Cheap stable ids on each column wrapper avoid React refs threading.
  const scrollToSlot = (idx: number) => {
    const el = document.querySelector(`[data-trade-slot="${idx}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const shellMobile: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: collapsed ? 'auto' : '70vh',
    borderTop: `2px solid ${primaryColor}`,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  };
  const shellDesktop: React.CSSProperties = {
    position: 'absolute',
    // SearchOverlay sits at top:16 with ~40px input height; the canvas toolbar
    // at top:62 is centered so it doesn't cross the right-docked panel, but
    // the search bar's right edge does on viewports narrower than ~1360px.
    // Pushing the panel to top:68 clears the search bar's full height.
    top: 68,
    right: 0,
    bottom: 0,
    width: 420,
    borderLeft: `2px solid ${primaryColor}`,
  };

  return (
    <div
      data-trade-machine-panel
      style={{
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(14, 14, 20, 0.97)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 0 40px rgba(0,0,0,0.55)',
        fontFamily: 'var(--font-body)',
        ...(isMobile ? shellMobile : shellDesktop),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#0a0a0f',
            background: primaryColor,
            padding: '3px 7px',
            borderRadius: 3,
            lineHeight: 1,
          }}
        >
          DRAFT
        </span>

        {/* Four always-visible team chips. Slots 1-2 are always active
            (matches addHypotheticalTrade's 2-slot seed). Slots 3-4 start
            inactive — clicking activates the slot (adds an empty column);
            ✕ removes it. Filled chips scroll the body to that column.
            "Add Team N" labels are gated sequentially: can't activate slot
            4 before slot 3 (the data model is positional). */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {[0, 1, 2, 3].map((i) => {
            const active = i < slots.length;
            const slot = active ? slots[i] : null;
            const teamId = slot?.teamId ?? null;
            const team = teamId ? getAnyTeamDisplayInfo(teamId) : null;
            const teamColor = teamColors[i] || null;
            const seedSlot = i < 2;
            // Sequential gate: only activate slot N if slots 1-2 are filled.
            const prereqsMet =
              !active &&
              slots.length >= i &&
              slots.slice(0, 2).every((s) => !!s.teamId);

            // Inactive placeholder chip
            if (!active) {
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!prereqsMet}
                  onClick={onAddTeam}
                  title={prereqsMet
                    ? `Add a ${i === 2 ? 'third' : 'fourth'} team`
                    : 'Pick the first two teams before adding more'}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    color: prereqsMet ? 'var(--text-secondary)' : 'var(--text-muted)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: `1px dashed ${prereqsMet ? `${ACCENT}88` : 'var(--border-subtle)'}`,
                    background: prereqsMet ? `${ACCENT}0d` : 'transparent',
                    cursor: prereqsMet ? 'pointer' : 'not-allowed',
                    transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (prereqsMet) {
                      e.currentTarget.style.background = `${ACCENT}1a`;
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (prereqsMet) {
                      e.currentTarget.style.background = `${ACCENT}0d`;
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  + Add Team {i + 1}
                </button>
              );
            }

            // Active slot, no team picked yet
            if (!teamId) {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToSlot(i)}
                  title="Scroll to this team's picker"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 12,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    border: `1px solid ${ACCENT}55`,
                    background: `${ACCENT}1a`,
                    cursor: 'pointer',
                    transition: 'background 160ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = `${ACCENT}2e`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = `${ACCENT}1a`; }}
                >
                  Add Team {i + 1}
                </button>
              );
            }

            // Active filled chip — team-color pill. Click to scroll; ✕ to
            // deactivate (slots 3+ only).
            const color = teamColor || ACCENT;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontFamily: 'var(--font-display)',
                  fontSize: 12,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: `1px solid ${color}55`,
                  background: `${color}1a`,
                }}
              >
                <button
                  type="button"
                  onClick={() => scrollToSlot(i)}
                  title="Scroll to this team's column"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    letterSpacing: 'inherit',
                    textTransform: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {team?.name.split(' ').pop() || teamId}
                </button>
                {!seedSlot && (
                  <button
                    type="button"
                    onClick={onRemoveSlot(i)}
                    aria-label={`Remove ${team?.name ?? 'team'}`}
                    title="Remove this team"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                      lineHeight: 1,
                      cursor: 'pointer',
                      padding: 0,
                      marginLeft: 2,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {isMobile && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        )}

        <button
          onClick={() => setWritingNode(null)}
          aria-label="Close trade editor"
          style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          ✕
        </button>
      </div>

      {/* Body — roster picker + ledger + legality.
          Block flow (NOT a flex column): in a height-constrained flex
          column the TeamColumns get shrunk to their minHeight while their
          content overflows and paints over the next column. Block + scroll
          lets each column keep its natural height; sticky legality still
          pins to the scrolling body. */}
      {!(isMobile && collapsed) && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 16px 28px',
          }}
        >
          <LegalitySection slots={slots} ownership={ownership} sticky />

          {slots.map((slot, idx) => (
            <div key={idx} data-trade-slot={idx} style={{ marginTop: 14, scrollMarginTop: 12 }}>
              <TeamColumn
                label={SLOT_LABELS[idx] ?? `Team ${idx + 1}`}
                state={slot}
                otherTeamIds={slots
                  .map((s, i) => (i !== idx ? s.teamId : null))
                  .filter((t): t is string => !!t)}
                allTeamIds={slots
                  .map((s) => s.teamId)
                  .filter((t): t is string => !!t)}
                onChange={onSlotChange(idx)}
                onRemove={idx >= 2 ? onRemoveSlot(idx) : undefined}
              />
            </div>
          ))}
          {/* "+ Add team" affordance moved up to the header chip row. */}

          <SalaryLedger slots={slots} />

          <ComparablesSection
            slots={slots}
            salaryCap={salaryCap}
            candidates={candidates}
            onResultsChange={onComparablesChange}
          />
        </div>
      )}
    </div>
  );
}
