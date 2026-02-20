'use client';

import type { SeasonDetailRow } from '@/lib/graph-store';

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
    fontSize: 9,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textAlign: 'right',
    padding: '1px 4px',
    borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    textAlign: 'right',
    padding: '2px 4px',
    lineHeight: '16px',
    whiteSpace: 'nowrap',
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: 'left' }}>Yr</th>
          <th style={thStyle}>GP</th>
          <th style={thStyle}>PPG</th>
          <th style={thStyle}>RPG</th>
          <th style={thStyle}>APG</th>
          <th style={thStyle}>WS</th>
          <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 6 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const shortSeason = r.season.length > 5 ? r.season.slice(2) : r.season;
          return (
            <tr key={r.season}>
              <td style={{ ...tdStyle, textAlign: 'left', fontSize: 10, color: 'var(--text-tertiary)' }}>
                {shortSeason}
              </td>
              <td style={tdStyle}>{r.gp ?? '--'}</td>
              <td style={tdStyle}>{r.ppg !== null ? r.ppg.toFixed(1) : '--'}</td>
              <td style={tdStyle}>{r.rpg !== null ? r.rpg.toFixed(1) : '--'}</td>
              <td style={tdStyle}>{r.apg !== null ? r.apg.toFixed(1) : '--'}</td>
              <td style={tdStyle}>{r.winShares !== null ? r.winShares.toFixed(1) : '--'}</td>
              <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: 6 }}>
                {r.accolades.length > 0 && (
                  <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'nowrap' }}>
                    {r.accolades.map((a, i) => (
                      <span
                        key={i}
                        title={a}
                        style={{
                          fontSize: 8,
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'rgba(249,199,79,0.15)',
                          color: '#f9c74f',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {abbreviateAccolade(a)}
                      </span>
                    ))}
                  </span>
                )}
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
                fontSize: 9,
                color: 'var(--text-muted)',
                paddingTop: 4,
                borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
              }}
            >
              {rows
                .filter(r => r.teamWins !== null)
                .map(r => {
                  const short = r.season.length > 5 ? r.season.slice(2) : r.season;
                  const record = `${short}: ${r.teamWins}-${r.teamLosses}`;
                  const playoff = r.playoffResult ? ` (${r.playoffResult})` : '';
                  return record + playoff;
                })
                .join(' | ')}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
