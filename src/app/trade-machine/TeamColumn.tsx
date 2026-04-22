'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS, TEAM_LIST } from '@/lib/teams';

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
  key: string;
  year: number;
  round: 1 | 2;
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

const PICK_YEARS = [2026, 2027, 2028, 2029, 2030, 2031] as const;

export default function TeamColumn({ label, state, otherTeamId, onChange }: Props) {
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [pickYear, setPickYear] = useState<number>(2026);
  const [pickRound, setPickRound] = useState<1 | 2>(1);

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

  const togglePlayer = (name: string) => {
    const next = new Set(state.selectedPlayerNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...state, selectedPlayerNames: next });
  };

  const addPick = () => {
    const key = `${pickYear}-r${pickRound}-${Date.now()}`;
    onChange({
      ...state,
      picks: [...state.picks, { key, year: pickYear, round: pickRound }],
    });
  };

  const removePick = (key: string) => {
    onChange({ ...state, picks: state.picks.filter((p) => p.key !== key) });
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
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
                      flex: 1,
                      fontSize: 13,
                      color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {p.player_name}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.age != null ? `${p.age}` : '—'}
                    {' · '}
                    {p.bpm != null ? `${p.bpm.toFixed(1)} BPM` : '— BPM'}
                    {' · '}
                    {p.salary != null ? `$${(p.salary / 1e6).toFixed(1)}M` : '—'}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Picks */}
      <div>
        <SectionLabel>Outgoing picks</SectionLabel>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <select
            value={pickYear}
            onChange={(e) => setPickYear(parseInt(e.target.value, 10))}
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 6px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
            }}
          >
            {PICK_YEARS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            {([1, 2] as const).map((r) => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`round-${label}`}
                  checked={pickRound === r}
                  onChange={() => setPickRound(r)}
                  style={{ accentColor: 'var(--accent-orange)' }}
                />
                Rd {r}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={addPick}
            disabled={!state.teamId}
            style={{
              marginLeft: 'auto',
              background: 'var(--accent-orange)',
              color: '#0a0a0f',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              cursor: state.teamId ? 'pointer' : 'not-allowed',
              opacity: state.teamId ? 1 : 0.4,
            }}
          >
            Add pick
          </button>
        </div>
        {state.picks.length === 0 ? (
          <EmptyHint>No picks added.</EmptyHint>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.picks.map((p) => (
              <span
                key={p.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 999,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--pick-yellow)',
                }}
              >
                {p.year} R{p.round}
                <button
                  type="button"
                  onClick={() => removePick(p.key)}
                  aria-label={`Remove ${p.year} round ${p.round} pick`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
