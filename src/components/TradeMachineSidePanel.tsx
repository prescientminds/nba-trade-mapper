'use client';

/**
 * Phase B Step 2b — canvas-native Trade Machine side panel.
 *
 * Docked-right editor for the hypothetical-trade node bound to the store's
 * `hypotheticalWritingNodeId`. The node's `data.sides` is the durable edit
 * intent (team + selected player names + picks); this panel hydrates a
 * working `BuilderState` from it, lets `TeamColumn` refetch the roster
 * from the team id, and persists the intent back via
 * `updateHypotheticalTrade` on every change.
 *
 * Hydration is keyed on `hypotheticalWritingNodeId` only (read imperatively
 * via getState), NOT the node object — otherwise persisting would re-trigger
 * hydration and clobber the working roster on every keystroke.
 *
 * Step 2c — comparables cards render below the ledger. The panel loads
 * `trade-profiles.json` and the 2025-26 salary cap (the ledger didn't
 * need the cap; the comparables cap-share factor does); `ComparablesSection`
 * recomputes reactively off [left, right, salaryCap].
 */

import { useEffect, useRef, useState } from 'react';
import { useMobile } from '@/lib/use-mobile';
import {
  useGraphStore,
  HypotheticalTradeNodeData,
  HypotheticalSide,
} from '@/lib/graph-store';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { getSupabase } from '@/lib/supabase';
import { type TradeProfile } from '@/lib/comparables';
import {
  CURRENT_SEASON,
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
  return {
    teamId: side.teamId,
    roster: [],
    selectedPlayerNames: new Set(side.playerNames),
    picks: side.picks,
  };
}

function toSide(state: BuilderState): HypotheticalSide {
  return {
    teamId: state.teamId,
    playerNames: [...state.selectedPlayerNames],
    picks: state.picks,
  };
}

export default function TradeMachineSidePanel() {
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const node = useGraphStore((s) =>
    s.nodes.find((n) => n.id === s.hypotheticalWritingNodeId),
  );
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const updateHypotheticalTrade = useGraphStore((s) => s.updateHypotheticalTrade);
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);

  const [ownership, setOwnership] = useState<Record<string, OwnedPick[]> | null>(null);
  const [salaryCap, setSalaryCap] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TradeProfile[] | null>(null);
  const [left, setLeft] = useState<BuilderState>(() => emptyState(null));
  const [right, setRight] = useState<BuilderState>(() => emptyState(null));

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
    setLeft(hydrateSide(sides[0]));
    setRight(hydrateSide(sides[1]));
  }, [writingNodeId]);

  // Persist intent back onto the node. Called from the column onChange
  // handlers with the up-to-date pair so there is no stale-closure window.
  const persist = useRef<(l: BuilderState, r: BuilderState) => void>(() => {});
  persist.current = (l, r) => {
    if (!writingNodeId) return;
    updateHypotheticalTrade(writingNodeId, [toSide(l), toSide(r)]);
  };

  const onLeftChange = (next: BuilderState) => {
    setLeft(next);
    persist.current(next, right);
  };
  const onRightChange = (next: BuilderState) => {
    setRight(next);
    persist.current(left, next);
  };

  if (!writingNodeId || !node || node.type !== 'hypotheticalTrade') return null;

  const { teamIds, teamColors } = node.data as HypotheticalTradeNodeData;
  const primaryColor = teamColors[0] || ACCENT;

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
    top: 0,
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

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {teamIds.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No teams yet</span>
          ) : (
            teamIds.map((tid, i) => (
              <span
                key={tid}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 12,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: `1px solid ${(teamColors[i] || ACCENT)}55`,
                  background: `${(teamColors[i] || ACCENT)}1a`,
                }}
              >
                {getAnyTeamDisplayInfo(tid)?.name.split(' ').pop() || tid}
              </span>
            ))
          )}
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
          <LegalitySection left={left} right={right} ownership={ownership} sticky />

          <div style={{ marginTop: 14 }}>
            <TeamColumn
              label="Team A"
              state={left}
              otherTeamId={right.teamId}
              onChange={onLeftChange}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <TeamColumn
              label="Team B"
              state={right}
              otherTeamId={left.teamId}
              onChange={onRightChange}
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
      )}
    </div>
  );
}
