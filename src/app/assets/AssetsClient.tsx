'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { TEAMS } from '@/lib/teams';
import { loadOwnership, type OwnedPick } from '@/lib/trade-builder';
import { currentTeamOf, loadCurrentRosterOverlay } from '@/lib/current-rosters';
import {
  buildRows,
  fmtMoney,
  tierLabel,
  TIER_COLOR,
  CURRENT_SEASON,
  NEXT_SEASON,
  PROJECTED_NEXT_CAP_FALLBACK,
  type TeamAssetRow,
  type Tier,
  type YoungPlayerRow,
} from './scorers';

type SortKey = 'team' | 'cap' | 'picks' | 'young' | 'stars';
type SortDir = 'asc' | 'desc';

const STAR_ACCOLADES = ['All-Star', 'All-NBA 1st Team', 'All-NBA 2nd Team', 'All-NBA 3rd Team'];
const STAR_LOOKBACK_SEASONS = ['2023-24', '2024-25', '2025-26'];

function normalizeName(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function AssetsClient() {
  const [rows, setRows] = useState<TeamAssetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectedCap, setProjectedCap] = useState(PROJECTED_NEXT_CAP_FALLBACK);
  const [capIsFallback, setCapIsFallback] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('picks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();

        // Try to read the real 2026-27 cap; fall back to projection if absent.
        const capRow = (await sb
          .from('salary_cap_history')
          .select('salary_cap')
          .eq('season', NEXT_SEASON)
          .limit(1)) as unknown as { data: { salary_cap: number | null }[] | null };
        let cap = PROJECTED_NEXT_CAP_FALLBACK;
        let isFallback = true;
        if (capRow.data?.[0]?.salary_cap) {
          cap = capRow.data[0].salary_cap;
          isFallback = false;
        }

        // Parallel queries. The overlay (current-rosters) is fetched alongside
        // the raw rows so we can re-map team_id values to reflect trades that
        // happened after Kaggle's last published cut.
        const [ownership, overlay, youngRowsRes, starsRes, currentContractsRes, nextContractsRes] =
          await Promise.all([
            loadOwnership(),
            loadCurrentRosterOverlay(),
            paginate(sb, 'player_seasons', 'player_name, team_id, age, bpm, mp', { season: CURRENT_SEASON }),
            sb
              .from('player_accolades')
              .select('player_name, accolade, season')
              .in('season', STAR_LOOKBACK_SEASONS)
              .in('accolade', STAR_ACCOLADES) as unknown as Promise<{
                data: { player_name: string; accolade: string; season: string }[] | null;
              }>,
            paginate(sb, 'player_contracts', 'player_name, team_id', { season: CURRENT_SEASON }),
            paginate(sb, 'player_contracts', 'player_name, team_id, salary', { season: NEXT_SEASON }),
          ]);

        if (cancelled) return;

        // Group young players by CURRENT team (overlay applied; trade JSON wins).
        // De-dupe by player_name keeping the higher-minutes row so split stints
        // collapse to the better sample.
        const youngBestByName = new Map<string, { player_name: string; team_id: string; age: number | null; bpm: number | null; mp: number | null }>();
        for (const r of youngRowsRes as Array<{ player_name: string; team_id: string; age: number | null; bpm: number | null; mp: number | null }>) {
          const existing = youngBestByName.get(r.player_name);
          if (!existing || (r.mp ?? 0) > (existing.mp ?? 0)) {
            youngBestByName.set(r.player_name, r);
          }
        }
        const youngByTeam: Record<string, YoungPlayerRow[]> = {};
        for (const r of youngBestByName.values()) {
          const teamId = currentTeamOf(r.player_name, r.team_id, overlay) ?? r.team_id;
          if (!youngByTeam[teamId]) youngByTeam[teamId] = [];
          youngByTeam[teamId].push({
            player_name: r.player_name,
            age: r.age,
            bpm: r.bpm,
            mp: r.mp,
          });
        }

        // Map player → CURRENT team (overlay applied) for star → roster join.
        const teamByNormalizedName = new Map<string, string>();
        for (const c of currentContractsRes as Array<{ player_name: string; team_id: string }>) {
          const teamId = currentTeamOf(c.player_name, c.team_id, overlay) ?? c.team_id;
          teamByNormalizedName.set(normalizeName(c.player_name), teamId);
        }

        // Group star players by team (last 3 seasons, deduped by player)
        const starsByTeam: Record<string, Set<string>> = {};
        const seenStars = new Set<string>();
        for (const a of starsRes.data ?? []) {
          const key = normalizeName(a.player_name);
          if (seenStars.has(key)) continue;
          seenStars.add(key);
          const team = teamByNormalizedName.get(key);
          if (!team) continue;
          if (!starsByTeam[team]) starsByTeam[team] = new Set();
          starsByTeam[team].add(a.player_name);
        }
        const starsByTeamArr: Record<string, string[]> = {};
        for (const [team, set] of Object.entries(starsByTeam)) {
          starsByTeamArr[team] = [...set];
        }

        // Sum 2026-27 commitments per CURRENT team. A player's cap hit follows
        // them to their new team after a trade, so we apply the overlay here too.
        const commitmentsByTeam: Record<string, number> = {};
        for (const c of nextContractsRes as Array<{ player_name: string; team_id: string; salary: number | null }>) {
          if (c.salary == null) continue;
          const teamId = currentTeamOf(c.player_name, c.team_id, overlay) ?? c.team_id;
          commitmentsByTeam[teamId] = (commitmentsByTeam[teamId] ?? 0) + c.salary;
        }

        const built = buildRows({
          ownershipByTeam: ownership,
          youngByTeam,
          starsByTeam: starsByTeamArr,
          commitmentsByTeam,
          projectedCap: cap,
        });

        setProjectedCap(cap);
        setCapIsFallback(isFallback);
        setRows(built);
      } catch (e) {
        console.error('Failed to build asset dashboard', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!rows) return null;
    const copy = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sortKey === 'team') return a.teamName.localeCompare(b.teamName) * dir;
      if (sortKey === 'cap') return (a.cap.score - b.cap.score) * dir;
      if (sortKey === 'picks') return (a.picks.score - b.picks.score) * dir;
      if (sortKey === 'young') return (a.young.score - b.young.score) * dir;
      return (a.stars.score - b.stars.score) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'team' ? 'asc' : 'desc');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-body)',
        padding: '48px 24px 96px',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 48,
              letterSpacing: '0.02em',
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            Team Asset Board
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: 14, margin: '8px 0 0', maxWidth: 720 }}>
            Sortable view of every team's tradeable assets. Sort by any column to find who has cap
            space to absorb salary, who's stacked with picks, who's young and rising, or who has stars
            to move. Click a row to see the underlying names.
          </p>
        </header>

        {error && (
          <div style={{ color: '#ff6b35', fontSize: 13, marginBottom: 16 }}>Failed to load: {error}</div>
        )}

        {!rows && !error && (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading 30 teams…</div>
        )}

        {sorted && (
          <>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              CAP: 2026-27 commitments vs {capIsFallback ? 'projected' : 'official'} ${(projectedCap / 1e6).toFixed(1)}M cap{capIsFallback ? ' (projection — apron tiers pending DB fill)' : ''}.{' '}
              PICKS: EV = round (1st=10, 2nd=2) × swap (×0.4) × cond. (×0.7).{' '}
              YOUNG: age ≤ 23 + BPM tiers (500-min floor).{' '}
              STARS: All-NBA or All-Star within 3 seasons, still on roster.
            </div>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-medium, #2a2a35)' }}>
                  <Th label="Team" k="team" sortKey={sortKey} sortDir={sortDir} onClick={setSort} align="left" />
                  <Th label="Cap Space" k="cap" sortKey={sortKey} sortDir={sortDir} onClick={setSort} />
                  <Th label="Future Picks" k="picks" sortKey={sortKey} sortDir={sortDir} onClick={setSort} />
                  <Th label="Young Talent" k="young" sortKey={sortKey} sortDir={sortDir} onClick={setSort} />
                  <Th label="Stars" k="stars" sortKey={sortKey} sortDir={sortDir} onClick={setSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <TeamRow
                    key={r.teamId}
                    row={r}
                    expanded={expanded === r.teamId}
                    onToggle={() => setExpanded(expanded === r.teamId ? null : r.teamId)}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align = 'right',
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      style={{
        textAlign: align,
        padding: '10px 12px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 500,
        userSelect: 'none',
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 6, color: '#ff6b35' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );
}

function TeamRow({
  row,
  expanded,
  onToggle,
}: {
  row: TeamAssetRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const team = TEAMS[row.teamId];
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderBottom: '1px solid var(--border-subtle, #1a1a22)',
          cursor: 'pointer',
          background: expanded ? 'rgba(255,255,255,0.02)' : 'transparent',
        }}
      >
        <td style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 4,
              height: 24,
              background: team.color,
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{team.name}</div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.06em',
              }}
            >
              {team.id} · {team.conference}
            </div>
          </div>
        </td>
        <ScoreCell
          primary={fmtMoney(row.cap.space)}
          secondary={tierLabel('cap', row.cap.tier)}
          tier={row.cap.tier}
        />
        <ScoreCell
          primary={row.picks.score.toFixed(1)}
          secondary={tierLabel('picks', row.picks.tier)}
          tier={row.picks.tier}
        />
        <ScoreCell
          primary={row.young.score.toFixed(1)}
          secondary={tierLabel('young', row.young.tier)}
          tier={row.young.tier}
        />
        <ScoreCell
          primary={row.stars.score.toString()}
          secondary={tierLabel('stars', row.stars.tier)}
          tier={row.stars.tier}
        />
      </tr>
      {expanded && (
        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
          <td colSpan={5} style={{ padding: '12px 16px 20px 28px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
              <DetailCol
                title="Cap (2026-27)"
                lines={[
                  `Committed: ${fmtMoney(row.cap.commitments)}`,
                  `Cap line: ${fmtMoney(row.cap.cap)}`,
                  `Space: ${fmtMoney(row.cap.space)}`,
                ]}
              />
              <DetailCol title="Top picks (EV)" lines={row.picks.sample.length ? row.picks.sample : ['—']} />
              <DetailCol title="Top young" lines={row.young.sample.length ? row.young.sample : ['—']} />
              <DetailCol title="Stars" lines={row.stars.sample.length ? row.stars.sample : ['—']} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ScoreCell({
  primary,
  secondary,
  tier,
}: {
  primary: string;
  secondary: string;
  tier: Tier;
}) {
  return (
    <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{primary}</div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: TIER_COLOR[tier],
          marginTop: 2,
        }}
      >
        {secondary}
      </div>
    </td>
  );
}

function DetailCol({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-tertiary)',
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, lineHeight: 1.6 }}>
        {lines.map((l, i) => (
          <li key={i} style={{ color: 'var(--text-secondary)' }}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

// PostgREST caps each select at 1000 rows. We paginate any query that might
// exceed that — player_seasons league-wide is ~550 active players, but
// player_contracts has historical rows for every season-year, so the 2025-26
// + 2026-27 cuts can land near or over the limit depending on multi-year deals.
async function paginate(
  sb: ReturnType<typeof getSupabase>,
  table: string,
  select: string,
  filters: Record<string, string>,
): Promise<unknown[]> {
  const out: unknown[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let q = sb.from(table).select(select);
    for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
    const { data, error } = (await q.range(from, from + pageSize - 1)) as unknown as {
      data: unknown[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
