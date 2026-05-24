'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS, TEAM_LIST } from '@/lib/teams';
import {
  BPM_MIN_MINUTES,
  CURRENT_SEASON,
  loadOwnership,
  type BuilderState,
  type OwnedPick,
  type OutgoingPick,
  type RosterPlayer,
} from '@/lib/trade-builder';
import { currentTeamOf, loadCurrentRosterOverlay } from '@/lib/current-rosters';
import BPMExplainer from './BPMExplainer';
import PickProtectionPopover, {
  loadProtections,
  type PickProtection,
} from './PickProtectionPopover';

interface Props {
  label: string;
  state: BuilderState;
  /** Team ids in use by other slots — those are disabled in the picker. */
  otherTeamIds: string[];
  /** All team ids in the trade (including this slot's). Used to derive the
   *  per-asset destination dropdown's options. When length >= 3 the dropdown
   *  renders; in 2-team mode the destination is implicit (the other side). */
  allTeamIds: string[];
  onChange: (next: BuilderState) => void;
  /** Optional remove-this-slot affordance (only shown for slots ≥ 3). */
  onRemove?: () => void;
}

export default function TeamColumn({ label, state, otherTeamIds, allTeamIds, onChange, onRemove }: Props) {
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [ownedPicks, setOwnedPicks] = useState<OwnedPick[] | null>(null);
  const [hoveredPickKey, setHoveredPickKey] = useState<string | null>(null);
  const [openProtectionKey, setOpenProtectionKey] = useState<string | null>(null);
  const [protections, setProtections] = useState<Record<string, PickProtection> | null>(null);

  // Load pick-protections.json once. Module-level cache lives in the popover file.
  useEffect(() => {
    let cancelled = false;
    loadProtections().then((p) => {
      if (!cancelled) setProtections(p);
    });
    return () => { cancelled = true; };
  }, []);

  // Fetch roster whenever teamId changes.
  useEffect(() => {
    if (!state.teamId) {
      // Reset roster if team cleared.
      if (state.roster.length > 0 || state.selectedPlayerNames.size > 0) {
        onChange({ ...state, roster: [], selectedPlayerNames: new Set() });
      }
      return;
    }
    let cancelled = false;
    setLoadingRoster(true);
    (async () => {
      const roster = await fetchRoster(state.teamId!);
      if (cancelled) return;
      setLoadingRoster(false);
      // Preserve selections that still exist on the new roster.
      const rosterNames = new Set(roster.map((r) => r.player_name));
      const prunedSelections = new Set(
        [...state.selectedPlayerNames].filter((n) => rosterNames.has(n)),
      );
      onChange({ ...state, roster, selectedPlayerNames: prunedSelections });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.teamId]);

  const team = state.teamId ? TEAMS[state.teamId] : null;

  // Load this team's owned picks whenever teamId changes.
  useEffect(() => {
    if (!state.teamId) { setOwnedPicks(null); return; }
    let cancelled = false;
    loadOwnership().then((byTeam) => {
      if (cancelled) return;
      setOwnedPicks(byTeam[state.teamId!] ?? []);
    });
    return () => { cancelled = true; };
  }, [state.teamId]);

  // Route targets = every team in the trade except this one. Used for the
  // per-asset destination dropdown AND for defaulting toTeamId on select so
  // a freshly-added asset always has SOME destination (otherwise it would
  // disappear from the node ledger entirely).
  const routeTargets = allTeamIds.filter((t) => !!t && t !== state.teamId);
  const showRouting = allTeamIds.length >= 3;
  const defaultDest = routeTargets[0] ?? null;

  const togglePlayer = (name: string) => {
    const next = new Set(state.selectedPlayerNames);
    const nextDests = new Map(state.playerDestinations);
    if (next.has(name)) {
      next.delete(name);
      nextDests.delete(name);
    } else {
      next.add(name);
      // Auto-default destination on select. 2-team mode: persistence layer
      // will fill the other side. N>=3: default to first other team so the
      // asset is immediately visible in the ledger; user can change via the
      // dropdown.
      if (showRouting) nextDests.set(name, defaultDest);
    }
    onChange({ ...state, selectedPlayerNames: next, playerDestinations: nextDests });
  };

  const setPlayerDestination = (name: string, toTeamId: string) => {
    const nextDests = new Map(state.playerDestinations);
    nextDests.set(name, toTeamId);
    onChange({ ...state, playerDestinations: nextDests });
  };

  const togglePick = (p: OwnedPick) => {
    const isSelected = state.picks.some((x) => x.pick_key === p.pick_key);
    const nextDests = new Map(state.pickDestinations);
    if (isSelected) {
      nextDests.delete(p.pick_key);
      onChange({
        ...state,
        picks: state.picks.filter((x) => x.pick_key !== p.pick_key),
        pickDestinations: nextDests,
      });
    } else {
      if (showRouting) nextDests.set(p.pick_key, defaultDest);
      onChange({
        ...state,
        picks: [
          ...state.picks,
          {
            pick_key: p.pick_key,
            year: p.year,
            round: p.round,
            original_team_id: p.original_team_id,
            asset_class: p.asset_class,
            conditional: p.conditional,
            lineage: p.lineage,
          },
        ],
        pickDestinations: nextDests,
      });
    }
  };

  const setPickDestination = (pick_key: string, toTeamId: string) => {
    const nextDests = new Map(state.pickDestinations);
    nextDests.set(pick_key, toTeamId);
    onChange({ ...state, pickDestinations: nextDests });
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${team ? hexToRgba(team.color, 0.35) : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 320,
        // Cap each column at ~40vh so both teams fit in the panel viewport
        // simultaneously and Team B's picker is always visible without
        // having to scroll through all of Team A's roster + picks.
        maxHeight: '40vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `2px solid ${team ? team.color : 'var(--border-medium)'}`,
          paddingBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <TeamPicker
          value={state.teamId}
          otherTeamIds={otherTeamIds}
          onChange={(v) =>
            onChange({ ...state, teamId: v, roster: [], selectedPlayerNames: new Set() })
          }
        />
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this team"
            title="Remove this team"
            style={{
              width: 24,
              height: 24,
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
        )}
      </div>

      {/* Roster */}
      <div>
        <SectionLabel>Outgoing players</SectionLabel>
        {!state.teamId && (
          <EmptyHint>Pick a team to see its 2025-26 roster.</EmptyHint>
        )}
        {state.teamId && loadingRoster && (
          <EmptyHint>Loading roster…</EmptyHint>
        )}
        {state.teamId && !loadingRoster && state.roster.length === 0 && (
          <EmptyHint>No 2025-26 roster data for this team.</EmptyHint>
        )}
        {state.roster.length > 0 && (
          <div>
            <RosterHeader />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                maxHeight: 280,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {state.roster.map((p) => {
                const selected = state.selectedPlayerNames.has(p.player_name);
                const dest = state.playerDestinations.get(p.player_name) ?? null;
                // BPM nulled because the player is under the minutes floor —
                // distinguish that "—" from a genuinely missing-data "—".
                const lowSample =
                  p.bpm == null &&
                  p.minutesPlayed != null &&
                  p.minutesPlayed < BPM_MIN_MINUTES;
                return (
                  <div key={p.player_name}>
                    <label
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '18px 1fr 30px 44px 56px',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: selected ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => togglePlayer(p.player_name)}
                        style={{ accentColor: 'var(--accent-orange)' }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.player_name}
                      </span>
                      <span style={statCellStyle}>
                        {p.age != null ? p.age : '—'}
                      </span>
                      <span
                        title={
                          lowSample
                            ? `Only ${p.minutesPlayed} min played — too small a sample for a meaningful BPM (floor is ${BPM_MIN_MINUTES})`
                            : undefined
                        }
                        style={{
                          ...statCellStyle,
                          color: p.bpm == null ? 'var(--text-muted)'
                            : p.bpm >= 5 ? '#6ee0d8'
                            : p.bpm >= 0 ? 'var(--text-secondary)'
                            : '#d88a88',
                          fontWeight: p.bpm != null && p.bpm >= 5 ? 700 : 400,
                          cursor: lowSample ? 'help' : undefined,
                        }}
                      >
                        {p.bpm != null ? (p.bpm > 0 ? `+${p.bpm.toFixed(1)}` : p.bpm.toFixed(1)) : '—'}
                      </span>
                      <span style={statCellStyle}>
                        {p.salary != null ? `$${(p.salary / 1e6).toFixed(1)}M` : '—'}
                      </span>
                    </label>
                    {selected && showRouting && (
                      <DestinationRow
                        teamId={state.teamId}
                        currentDest={dest}
                        routeTargets={routeTargets}
                        onChange={(toTid) => setPlayerDestination(p.player_name, toTid)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Picks — owned pick war chest */}
      <div>
        <SectionLabel>Outgoing picks · war chest</SectionLabel>
        {!state.teamId && (
          <EmptyHint>Pick a team to see their draft picks.</EmptyHint>
        )}
        {state.teamId && ownedPicks === null && (
          <EmptyHint>Loading picks…</EmptyHint>
        )}
        {state.teamId && ownedPicks && ownedPicks.length === 0 && (
          <EmptyHint>No tradeable picks for this team.</EmptyHint>
        )}
        {state.teamId && ownedPicks && ownedPicks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
            {ownedPicks.map((p) => {
              const selected = state.picks.some((x) => x.pick_key === p.pick_key);
              const isOwn = p.original_team_id === state.teamId;
              const isSwap = p.asset_class === 'swap';
              const originLabel = isSwap
                ? `swap vs ${p.original_team_id}`
                : isOwn
                  ? 'own'
                  : `via ${p.original_team_id}`;
              const hovered = hoveredPickKey === p.pick_key;
              return (
                <div
                  key={p.pick_key}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredPickKey(p.pick_key)}
                  onMouseLeave={() => setHoveredPickKey(null)}
                >
                  <label
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '18px 58px 1fr auto',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: selected ? 'rgba(255, 107, 53, 0.1)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => togglePick(p)}
                      style={{ accentColor: 'var(--accent-orange)' }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: isSwap ? 'var(--accent-purple)' : 'var(--pick-yellow, #f9c74f)',
                      }}
                    >
                      {p.year} R{p.round}
                    </span>
                    <span style={{ fontSize: 11, color: isOwn ? 'var(--text-muted)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSwap && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: 'var(--accent-purple)',
                            padding: '1px 5px',
                            borderRadius: 999,
                            background: 'rgba(155, 93, 229, 0.18)',
                            border: '1px solid rgba(155, 93, 229, 0.4)',
                          }}
                        >
                          swap
                        </span>
                      )}
                      {originLabel}
                    </span>
                    {p.conditional && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenProtectionKey(
                            openProtectionKey === p.pick_key ? null : p.pick_key,
                          );
                        }}
                        title="Click for protection details"
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: 'var(--accent-purple)',
                          padding: '1px 6px',
                          borderRadius: 999,
                          background:
                            openProtectionKey === p.pick_key
                              ? 'rgba(155, 93, 229, 0.25)'
                              : 'rgba(155, 93, 229, 0.12)',
                          border: '1px solid rgba(155, 93, 229, 0.3)',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        cond.
                      </button>
                    )}
                  </label>
                  {openProtectionKey === p.pick_key && (
                    <PickProtectionPopover
                      protection={protections?.[p.pick_key] ?? null}
                      fallbackSnippet={p.lineage[p.lineage.length - 1]?.description_snippet}
                      onClose={() => setOpenProtectionKey(null)}
                    />
                  )}
                  {hovered && openProtectionKey !== p.pick_key && p.lineage.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 18,
                        right: 0,
                        zIndex: 10,
                        marginTop: 2,
                        padding: '8px 10px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        Lineage
                      </div>
                      {p.lineage.map((step, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{step.date}</span>
                          {' · '}
                          {step.from_team_id} → {step.to_team_id}
                        </div>
                      ))}
                    </div>
                  )}
                  {selected && showRouting && (
                    <DestinationRow
                      teamId={state.teamId}
                      currentDest={state.pickDestinations.get(p.pick_key) ?? null}
                      routeTargets={routeTargets}
                      onChange={(toTid) => setPickDestination(p.pick_key, toTid)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {state.picks.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
            {state.picks.length} pick{state.picks.length === 1 ? '' : 's'} selected
          </div>
        )}
      </div>
    </div>
  );
}

// ── Roster fetch ───────────────────────────────────────────────────

// Module-level caches so we only do the league-wide fetches once per page load.
// Per-team filtering happens client-side after the trade-aware overlay is applied.
type AllSeasonsRow = { player_name: string; team_id: string; age: number | null; bpm: number | null; mp: number | null };
type AllContractsRow = { player_name: string; team_id: string; salary: number | null };
type AllFutureContractsRow = { player_name: string; team_id: string; season: string };

let allSeasonsCache: AllSeasonsRow[] | null = null;
let allContractsCache: AllContractsRow[] | null = null;
let allFutureContractsCache: AllFutureContractsRow[] | null = null;
let allSeasonsPromise: Promise<AllSeasonsRow[]> | null = null;
let allContractsPromise: Promise<AllContractsRow[]> | null = null;
let allFutureContractsPromise: Promise<AllFutureContractsRow[]> | null = null;

async function paginate<T>(query: () => { range: (a: number, b: number) => Promise<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function loadAllSeasons(): Promise<AllSeasonsRow[]> {
  if (allSeasonsCache) return allSeasonsCache;
  if (allSeasonsPromise) return allSeasonsPromise;
  const sb = getSupabase();
  allSeasonsPromise = paginate<AllSeasonsRow>(() => sb
    .from('player_seasons')
    .select('player_name, team_id, age, bpm, mp')
    .eq('season', CURRENT_SEASON) as unknown as { range: (a: number, b: number) => Promise<{ data: AllSeasonsRow[] | null; error: { message: string } | null }> })
    .then((rows) => { allSeasonsCache = rows; return rows; });
  return allSeasonsPromise;
}

async function loadAllContracts(): Promise<AllContractsRow[]> {
  if (allContractsCache) return allContractsCache;
  if (allContractsPromise) return allContractsPromise;
  const sb = getSupabase();
  allContractsPromise = paginate<AllContractsRow>(() => sb
    .from('player_contracts')
    .select('player_name, team_id, salary')
    .eq('season', CURRENT_SEASON) as unknown as { range: (a: number, b: number) => Promise<{ data: AllContractsRow[] | null; error: { message: string } | null }> })
    .then((rows) => { allContractsCache = rows; return rows; });
  return allContractsPromise;
}

async function loadAllFutureContracts(): Promise<AllFutureContractsRow[]> {
  if (allFutureContractsCache) return allFutureContractsCache;
  if (allFutureContractsPromise) return allFutureContractsPromise;
  const sb = getSupabase();
  allFutureContractsPromise = paginate<AllFutureContractsRow>(() => sb
    .from('player_contracts')
    .select('player_name, team_id, season')
    .gt('season', CURRENT_SEASON) as unknown as { range: (a: number, b: number) => Promise<{ data: AllFutureContractsRow[] | null; error: { message: string } | null }> })
    .then((rows) => { allFutureContractsCache = rows; return rows; });
  return allFutureContractsPromise;
}

async function fetchRoster(teamId: string): Promise<RosterPlayer[]> {
  const [allSeasons, allContracts, allFutureContracts, overlay] = await Promise.all([
    loadAllSeasons(),
    loadAllContracts(),
    loadAllFutureContracts(),
    loadCurrentRosterOverlay(),
  ]);

  // Apply the overlay: a player's "current team" is the overlay's value (if
  // set) or the source table's team_id (if no recent trade moved them).
  const seasons = allSeasons.filter(
    (s) => currentTeamOf(s.player_name, s.team_id, overlay) === teamId,
  );
  const contracts = allContracts.filter(
    (c) => currentTeamOf(c.player_name, c.team_id, overlay) === teamId,
  );
  const futureContracts = allFutureContracts.filter(
    (f) => currentTeamOf(f.player_name, f.team_id, overlay) === teamId,
  );

  if (!seasons) return [];

  const salaryByName = new Map<string, number | null>();
  for (const c of contracts ?? []) salaryByName.set(normalizeName(c.player_name), c.salary);

  const futureCountByName = new Map<string, number>();
  for (const f of futureContracts ?? []) {
    const k = normalizeName(f.player_name);
    futureCountByName.set(k, (futureCountByName.get(k) ?? 0) + 1);
  }

  // Dedupe by player_name. A mid-season trade produces split rows (one per
  // stint); after the overlay maps them to the same current team we want the
  // higher-minutes row to win so stats come from the better sample.
  const bestRowByName = new Map<string, AllSeasonsRow>();
  for (const s of seasons) {
    const existing = bestRowByName.get(s.player_name);
    if (!existing || (s.mp ?? 0) > (existing.mp ?? 0)) {
      bestRowByName.set(s.player_name, s);
    }
  }
  const roster: RosterPlayer[] = [];
  for (const s of bestRowByName.values()) {
    const key = normalizeName(s.player_name);
    // BPM is a per-100-possession rate stat — meaningless on a tiny sample.
    // Below the minutes floor we null it so a garbage-time line (e.g. an 8-min
    // rookie at +11.5) doesn't sort to the top of the roster or skew the
    // comparables matcher. `minutesPlayed` is kept so the display can label
    // a sub-floor "—" as "limited sample" rather than "no data".
    const qualified = s.mp != null && s.mp >= BPM_MIN_MINUTES;
    roster.push({
      player_name: s.player_name,
      age: s.age,
      bpm: qualified ? s.bpm : null,
      minutesPlayed: s.mp,
      salary: salaryByName.get(key) ?? null,
      contractYearsRemaining: futureCountByName.get(key) ?? 0,
    });
  }
  // Sort by BPM desc, ties by name. Puts stars at the top.
  roster.sort((a, b) => {
    const ab = a.bpm ?? -Infinity;
    const bb = b.bpm ?? -Infinity;
    if (ab !== bb) return bb - ab;
    return a.player_name.localeCompare(b.player_name);
  });
  return roster;
}

// player_contracts strips diacritics while player_seasons keeps them. Lower + strip.
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ── Bits ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-muted)',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
      {children}
    </div>
  );
}

/**
 * Per-asset destination dropdown. Renders beneath a selected player or pick
 * row when the trade involves 3+ teams. In 2-team trades the destination is
 * implicit (the other side) — the panel's persist-time toSide() fills it
 * automatically and this row is hidden.
 *
 * The arrow + native `<select>` is intentionally compact — this is a
 * frequently-displayed control and a custom popover would overweight the
 * row. Native select honors macOS/Windows/iOS conventions for the picker.
 */
function DestinationRow({
  teamId,
  currentDest,
  routeTargets,
  onChange,
}: {
  teamId: string | null;
  currentDest: string | null;
  routeTargets: string[];
  onChange: (toTeamId: string) => void;
}) {
  if (!teamId || routeTargets.length === 0) return null;
  const currentTeam = currentDest ? TEAMS[currentDest] : null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px 4px 32px',
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ fontSize: 11 }}>→</span>
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>to</span>
      <select
        value={currentDest ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          padding: '2px 6px',
          borderRadius: 3,
          border: `1px solid ${currentTeam ? hexToRgba(currentTeam.color, 0.5) : 'var(--border-medium)'}`,
          background: currentTeam ? hexToRgba(currentTeam.color, 0.15) : 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          cursor: 'pointer',
        }}
      >
        {!currentDest && <option value="">— pick team —</option>}
        {routeTargets.map((tid) => (
          <option key={tid} value={tid}>
            {TEAMS[tid]?.name.split(' ').pop() || tid}
          </option>
        ))}
      </select>
    </div>
  );
}

const statCellStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
  textAlign: 'right',
};

function RosterHeader() {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const headerStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    textAlign: 'right',
  };
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '18px 1fr 30px 44px 56px',
          gap: 6,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: 4,
        }}
      >
        <span />
        <span style={{ ...headerStyle, textAlign: 'left' }}>Player</span>
        <span style={headerStyle}>Age</span>
        <span
          style={{ ...headerStyle, cursor: 'pointer', color: 'var(--text-secondary)' }}
          onClick={(e) => { e.preventDefault(); setExplainerOpen(true); }}
          title="What is BPM? Click to learn more."
        >
          BPM <span style={{ color: 'var(--accent-orange)', marginLeft: 1 }}>ⓘ</span>
        </span>
        <span style={headerStyle}>Salary</span>
      </div>
      {explainerOpen && <BPMExplainer onClose={() => setExplainerOpen(false)} />}
    </>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── TeamPicker — styled dropdown matching the rest of the app ──────
//
// Replaces the browser-native <select>, which used OS chrome for the
// open list and didn't honor the dark theme. Click-outside and Escape
// close the panel.

interface TeamPickerProps {
  value: string | null;
  otherTeamIds: string[];
  onChange: (next: string | null) => void;
}

function TeamPicker({ value, otherTeamIds, onChange }: TeamPickerProps) {
  const otherTeamSet = new Set(otherTeamIds);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const team = value ? TEAMS[value] : null;
  const accent = team ? team.color : 'var(--accent-orange)';

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: team ? 'var(--bg-elevated)' : 'rgba(255, 107, 53, 0.08)',
          color: team ? 'var(--text-primary)' : 'var(--text-primary)',
          border: `1px solid ${team ? hexToRgba(accent, 0.45) : 'rgba(255, 107, 53, 0.75)'}`,
          borderRadius: 'var(--radius-sm)',
          padding: '7px 10px',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: team ? 400 : 600,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          boxShadow: team
            ? 'none'
            : '0 0 0 2px rgba(255, 107, 53, 0.18), 0 2px 12px rgba(255, 107, 53, 0.18)',
          transition: 'box-shadow 160ms ease, background 160ms ease, border-color 160ms ease',
        }}
      >
        <span>{team ? team.name : 'Choose team…'}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            opacity: 0.6,
          }}
        >
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            maxHeight: 320,
            overflowY: 'auto',
            padding: 4,
          }}
          role="listbox"
        >
          {TEAM_LIST.map((t) => {
            const disabled = otherTeamSet.has(t.id);
            const isSelected = value === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={disabled}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  background: isSelected ? hexToRgba(t.color, 0.12) : 'transparent',
                  color: disabled
                    ? 'var(--text-muted)'
                    : isSelected
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  border: 'none',
                  borderLeft: `2px solid ${isSelected ? t.color : 'transparent'}`,
                  borderRadius: 4,
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!disabled && !isSelected) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled && !isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: t.color,
                    flexShrink: 0,
                  }}
                />
                <span>{t.name}</span>
                {disabled && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    in use
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
