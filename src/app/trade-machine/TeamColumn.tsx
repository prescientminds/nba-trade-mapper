'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS, TEAM_LIST } from '@/lib/teams';
import BPMExplainer from './BPMExplainer';

const CURRENT_SEASON = '2025-26';

export interface RosterPlayer {
  player_name: string;
  age: number | null;
  bpm: number | null;
  salary: number | null;
  /** Contract years remaining AFTER 2025-26 (0 = expiring). */
  contractYearsRemaining: number | null;
}

export interface OutgoingPick {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  conditional: boolean;
  lineage: Array<{
    trade_id: string;
    date: string;
    from_team_id: string | null;
    to_team_id: string | null;
    description_snippet: string;
  }>;
}

/** A pick entry loaded from /data/pick-ownership.json. */
export interface OwnedPick {
  pick_key: string;
  year: number;
  round: 1 | 2;
  original_team_id: string;
  current_owner_team_id: string;
  conditional: boolean;
  lineage: OutgoingPick['lineage'];
}

export interface BuilderState {
  teamId: string | null;
  roster: RosterPlayer[];
  selectedPlayerNames: Set<string>;
  picks: OutgoingPick[];
}

interface Props {
  label: string;
  state: BuilderState;
  otherTeamId: string | null;
  onChange: (next: BuilderState) => void;
}

// Module-level cache — pick-ownership.json is static and only needs to be
// fetched once per page load, not once per team column.
let ownershipCache: Record<string, OwnedPick[]> | null = null;
let ownershipPromise: Promise<Record<string, OwnedPick[]>> | null = null;
async function loadOwnership(): Promise<Record<string, OwnedPick[]>> {
  if (ownershipCache) return ownershipCache;
  if (ownershipPromise) return ownershipPromise;
  ownershipPromise = fetch('/data/pick-ownership.json')
    .then((r) => r.json())
    .then((j) => {
      ownershipCache = j.teams as Record<string, OwnedPick[]>;
      return ownershipCache!;
    });
  return ownershipPromise;
}

export default function TeamColumn({ label, state, otherTeamId, onChange }: Props) {
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [ownedPicks, setOwnedPicks] = useState<OwnedPick[] | null>(null);
  const [hoveredPickKey, setHoveredPickKey] = useState<string | null>(null);

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

  const togglePlayer = (name: string) => {
    const next = new Set(state.selectedPlayerNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...state, selectedPlayerNames: next });
  };

  const togglePick = (p: OwnedPick) => {
    const isSelected = state.picks.some((x) => x.pick_key === p.pick_key);
    if (isSelected) {
      onChange({ ...state, picks: state.picks.filter((x) => x.pick_key !== p.pick_key) });
    } else {
      onChange({
        ...state,
        picks: [
          ...state.picks,
          {
            pick_key: p.pick_key,
            year: p.year,
            round: p.round,
            original_team_id: p.original_team_id,
            conditional: p.conditional,
            lineage: p.lineage,
          },
        ],
      });
    }
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
        <select
          value={state.teamId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...state, teamId: v || null, roster: [], selectedPlayerNames: new Set() });
          }}
          style={{
            flex: 1,
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 8px',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
          }}
        >
          <option value="">Choose team…</option>
          {TEAM_LIST.map((t) => (
            <option
              key={t.id}
              value={t.id}
              disabled={otherTeamId === t.id}
            >
              {t.name}
            </option>
          ))}
        </select>
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
                return (
                  <label
                    key={p.player_name}
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
                      style={{
                        ...statCellStyle,
                        color: p.bpm == null ? 'var(--text-muted)'
                          : p.bpm >= 5 ? '#6ee0d8'
                          : p.bpm >= 0 ? 'var(--text-secondary)'
                          : '#d88a88',
                        fontWeight: p.bpm != null && p.bpm >= 5 ? 700 : 400,
                      }}
                    >
                      {p.bpm != null ? (p.bpm > 0 ? `+${p.bpm.toFixed(1)}` : p.bpm.toFixed(1)) : '—'}
                    </span>
                    <span style={statCellStyle}>
                      {p.salary != null ? `$${(p.salary / 1e6).toFixed(1)}M` : '—'}
                    </span>
                  </label>
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
              const originLabel = isOwn
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
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--pick-yellow, #f9c74f)' }}>
                      {p.year} R{p.round}
                    </span>
                    <span style={{ fontSize: 11, color: isOwn ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                      {originLabel}
                    </span>
                    {p.conditional && (
                      <span
                        title="Trade description references protection, swap, or conditional language. Structured rules not yet enforced."
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: 'var(--accent-purple)',
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: 'rgba(155, 93, 229, 0.12)',
                          border: '1px solid rgba(155, 93, 229, 0.3)',
                        }}
                      >
                        cond.
                      </span>
                    )}
                  </label>
                  {hovered && p.lineage.length > 0 && (
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

async function fetchRoster(teamId: string): Promise<RosterPlayer[]> {
  const sb = getSupabase();

  const [{ data: seasons }, { data: contracts }, { data: futureContracts }] = await Promise.all([
    sb
      .from('player_seasons')
      .select('player_name, age, bpm')
      .eq('team_id', teamId)
      .eq('season', CURRENT_SEASON) as unknown as Promise<{
        data: { player_name: string; age: number | null; bpm: number | null }[] | null;
      }>,
    sb
      .from('player_contracts')
      .select('player_name, salary')
      .eq('team_id', teamId)
      .eq('season', CURRENT_SEASON) as unknown as Promise<{
        data: { player_name: string; salary: number | null }[] | null;
      }>,
    // Count future seasons under contract per player. We pull rows > 2025-26;
    // later we count how many each player has. Uses player_name because that's
    // how contracts are keyed; the diacritic mismatch with player_seasons is a
    // known v1 gap.
    sb
      .from('player_contracts')
      .select('player_name, season')
      .eq('team_id', teamId)
      .gt('season', CURRENT_SEASON) as unknown as Promise<{
        data: { player_name: string; season: string }[] | null;
      }>,
  ]);

  if (!seasons) return [];

  const salaryByName = new Map<string, number | null>();
  for (const c of contracts ?? []) salaryByName.set(normalizeName(c.player_name), c.salary);

  const futureCountByName = new Map<string, number>();
  for (const f of futureContracts ?? []) {
    const k = normalizeName(f.player_name);
    futureCountByName.set(k, (futureCountByName.get(k) ?? 0) + 1);
  }

  // Dedupe by player_name (in case of mid-season team changes showing dup rows).
  const seenNames = new Set<string>();
  const roster: RosterPlayer[] = [];
  for (const s of seasons) {
    if (seenNames.has(s.player_name)) continue;
    seenNames.add(s.player_name);
    const key = normalizeName(s.player_name);
    roster.push({
      player_name: s.player_name,
      age: s.age,
      bpm: s.bpm,
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
