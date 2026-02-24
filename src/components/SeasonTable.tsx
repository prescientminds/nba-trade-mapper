'use client';

import type { SeasonDetailRow } from '@/lib/graph-store';

function playoffBadge(result: string | null): { label: string; color: string; bg: string } | null {
  if (result === 'CHAMP')  return { label: '🏆 Champ',  color: '#f9c74f', bg: 'rgba(249,199,79,0.18)' };
  if (result === 'FINALS') return { label: 'Finals',    color: '#9b5de5', bg: 'rgba(155,93,229,0.18)' };
  if (result === 'CONF')   return { label: 'Conf Finals', color: '#4ecdc4', bg: 'rgba(78,205,196,0.15)' };
  return null;
}

function abbreviateAccolade(a: string): string {
  if (a === 'MVP') return 'MVP';
  if (a === 'All-Star') return 'AS';
  if (a.includes('Champion')) return 'Champ';
  if (a.includes('All-NBA')) return 'All-NBA';
  if (a.includes('All-Defensive')) return 'All-Def';
  if (a.includes('All-Rookie')) return 'All-Rk';
  if (a === 'DPOY') return 'DPOY';
  if (a === 'ROY') return 'ROY';
  if (a === 'MIP') return 'MIP';
  if (a === 'Sixth Man') return '6MOY';
  return a.length > 8 ? a.slice(0, 7) + '\u2026' : a;
}

export function SeasonTable({ rows }: { rows: SeasonDetailRow[] }) {
  const thStyle: React.CSSProperties = {
    fontSize: 8,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textAlign: 'right',
    padding: '1px 3px',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    textAlign: 'right',
    padding: '1px 3px',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 2, tableLayout: 'fixed' }}>
      {/* Fixed widths for stat columns; last column gets remainder for accolades */}
      <colgroup>
        <col style={{ width: 28 }} />{/* Yr  */}
        <col style={{ width: 19 }} />{/* GP  */}
        <col style={{ width: 25 }} />{/* PPG */}
        <col style={{ width: 25 }} />{/* RPG */}
        <col style={{ width: 20 }} />{/* APG */}
        <col style={{ width: 23 }} />{/* WS  */}
        <col />                       {/* Accolades — all remaining width */}
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: 'left' }}>Yr</th>
          <th style={thStyle}>GP</th>
          <th style={thStyle}>PPG</th>
          <th style={thStyle}>RPG</th>
          <th style={thStyle}>APG</th>
          <th style={thStyle}>WS</th>
          <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 5 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const shortSeason = r.season.length > 5 ? r.season.slice(2) : r.season;
          const compactTd: React.CSSProperties = { ...tdStyle, padding: '1px 2px' };
          return (
            <tr key={r.season}>
              <td style={{ ...compactTd, textAlign: 'left', fontSize: 9, color: 'var(--text-tertiary)', padding: '1px 2px 1px 0' }}>
                {shortSeason}
              </td>
              <td style={compactTd}>{r.gp ?? '--'}</td>
              <td style={compactTd}>{r.ppg !== null ? r.ppg.toFixed(1) : '--'}</td>
              <td style={compactTd}>{r.rpg !== null ? r.rpg.toFixed(1) : '--'}</td>
              <td style={compactTd}>{r.apg !== null ? r.apg.toFixed(1) : '--'}</td>
              <td style={compactTd}>{r.winShares !== null ? r.winShares.toFixed(1) : '--'}</td>
              <td style={{ ...compactTd, textAlign: 'left', paddingLeft: 3, overflow: 'hidden' }}>
                <span style={{ display: 'inline-flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                  {r.accolades.map((a, i) => (
                    <span
                      key={i}
                      title={a}
                      style={{
                        fontSize: 7,
                        fontFamily: 'var(--font-body)',
                        fontWeight: 600,
                        padding: '0px 3px',
                        borderRadius: 2,
                        background: 'rgba(249,199,79,0.15)',
                        color: '#f9c74f',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {abbreviateAccolade(a)}
                    </span>
                  ))}
                  {(() => {
                    const pb = playoffBadge(r.playoffResult);
                    if (!pb) return null;
                    return (
                      <span
                        title={`Playoff result: ${r.playoffResult}`}
                        style={{
                          fontSize: 7,
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          padding: '0px 3px',
                          borderRadius: 2,
                          background: pb.bg,
                          color: pb.color,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {pb.label}
                      </span>
                    );
                  })()}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
      {rows.some(r => r.teamWins !== null) && (
        <tfoot>
          <tr>
            <td
              colSpan={7}
              style={{
                fontSize: 8,
                color: 'var(--text-muted)',
                paddingTop: 2,
                borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              }}
            >
              {rows
                .filter(r => r.teamWins !== null)
                .map(r => {
                  const short = r.season.length > 5 ? r.season.slice(2) : r.season;
                  return `${short}: ${r.teamWins}-${r.teamLosses}`;
                })
                .join(' | ')}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
