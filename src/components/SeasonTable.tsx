'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { SeasonDetailRow, PlayoffPeakGame, PlayoffSeries } from '@/lib/graph-store';

function playoffBadge(result: string | null): { label: string; color: string; bg: string } | null {
  if (result === 'CHAMP')  return { label: '🏆 Champ',  color: '#f9c74f', bg: 'rgba(249,199,79,0.18)' };
  if (result === 'FINALS') return { label: 'Finals',    color: '#c4a0f5', bg: 'rgba(196,160,245,0.18)' };
  if (result === 'CONF')   return { label: 'Conf Finals', color: '#6ee0d8', bg: 'rgba(110,224,216,0.15)' };
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

function PeakBadge({ game, onClick }: { game: PlayoffPeakGame; onClick: () => void }) {
  return (
    <span
      className="nopan nodrag"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        fontSize: 7,
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        padding: '0px 3px',
        borderRadius: 2,
        background: 'rgba(78,205,196,0.15)',
        color: '#4ecdc4',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
      title="Game Score — click to see series"
    >
      {'\uD83D\uDD26'} {game.gameScore.toFixed(1)} R{game.round}G{game.gameNumber}
    </span>
  );
}

function SeriesPanel({ series }: { series: PlayoffSeries }) {
  const wins = series.games.filter(g => g.result === 'W').length;
  const losses = series.games.filter(g => g.result !== 'W').length;
  const seriesResult = wins > losses ? `W ${wins}-${losses}` : `L ${wins}-${losses}`;

  const thStyle: React.CSSProperties = {
    fontSize: 7,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textAlign: 'right',
    padding: '1px 2px',
    whiteSpace: 'nowrap',
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 8,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    textAlign: 'right',
    padding: '1px 2px',
    lineHeight: '12px',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ padding: '3px 0 2px' }}>
      <div style={{
        fontSize: 8,
        fontWeight: 600,
        color: '#4ecdc4',
        marginBottom: 2,
      }}>
        R{series.round} vs {series.opponentId} ({seriesResult})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', width: 18 }}>Gm</th>
            <th style={{ ...thStyle, width: 22 }}>PTS</th>
            <th style={{ ...thStyle, width: 22 }}>REB</th>
            <th style={{ ...thStyle, width: 22 }}>AST</th>
            <th style={{ ...thStyle, width: 26 }}>GS</th>
            <th style={{ ...thStyle, textAlign: 'left' }}></th>
          </tr>
        </thead>
        <tbody>
          {series.games.map(g => (
            <tr key={g.gameNumber}>
              <td style={{ ...tdStyle, textAlign: 'left', color: 'var(--text-muted)' }}>{g.gameNumber}</td>
              <td style={tdStyle}>{g.pts}</td>
              <td style={tdStyle}>{g.trb}</td>
              <td style={tdStyle}>{g.ast}</td>
              <td style={{
                ...tdStyle,
                color: g.gameScore !== null && g.gameScore >= 20 ? '#4ecdc4' : 'var(--text-secondary)',
                fontWeight: g.gameScore !== null && g.gameScore >= 20 ? 600 : 400,
              }}>
                {g.gameScore !== null ? g.gameScore.toFixed(1) : '--'}
              </td>
              <td style={{
                ...tdStyle,
                textAlign: 'left',
                paddingLeft: 3,
                color: g.result === 'W' ? 'var(--text-secondary)' : 'var(--text-muted)',
              }}>
                {g.result === 'W' ? 'W' : 'L'}
                {g.gameMargin != null && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 7 }}>
                    {' '}{g.gameMargin > 0 ? `+${g.gameMargin}` : g.gameMargin}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ValueChart({ rows }: { rows: SeasonDetailRow[] }) {
  const data = rows
    .map(r => ({ season: r.season, ws: r.winShares, salary: r.salary }))
    .filter(d => d.ws !== null || d.salary !== null);

  if (data.length < 2) return (
    <div style={{ padding: '4px 0 2px', fontSize: 7, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', opacity: 0.6 }}>
      Not enough seasons to chart
    </div>
  );

  const W = 180;
  const H = 56;
  const padL = 22;
  const padR = 22;
  const padT = 6;
  const padB = 14;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const wsVals = data.map(d => d.ws ?? 0);
  const salVals = data.map(d => d.salary ?? 0);
  const wsMax = Math.max(...wsVals, 1);
  const salMax = Math.max(...salVals, 1);

  const xStep = data.length > 1 ? plotW / (data.length - 1) : 0;

  const wsPoints = data.map((d, i) => ({
    x: padL + i * xStep,
    y: padT + plotH - ((d.ws ?? 0) / wsMax) * plotH,
  }));
  const salPoints = data.map((d, i) => ({
    x: padL + i * xStep,
    y: padT + plotH - ((d.salary ?? 0) / salMax) * plotH,
  }));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const hasSalary = salVals.some(v => v > 0);

  return (
    <div style={{ padding: '4px 0 2px', overflow: 'hidden' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Grid lines */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />

        {/* Salary line (behind) */}
        {hasSalary && (
          <>
            <path d={toPath(salPoints)} fill="none" stroke="#4ecdc4" strokeWidth={1.2} opacity={0.5} />
            {salPoints.map((p, i) => (
              <circle key={`s${i}`} cx={p.x} cy={p.y} r={1.5} fill="#4ecdc4" opacity={0.6} />
            ))}
          </>
        )}

        {/* WS line (front) */}
        <path d={toPath(wsPoints)} fill="none" stroke="#ff6b35" strokeWidth={1.5} opacity={0.9} />
        {wsPoints.map((p, i) => (
          <circle key={`w${i}`} cx={p.x} cy={p.y} r={1.5} fill="#ff6b35" />
        ))}

        {/* Y-axis labels */}
        <text x={padL - 2} y={padT + 3} textAnchor="end" fontSize={6} fill="#ff6b35" fontFamily="var(--font-mono)">
          {wsMax.toFixed(0)}
        </text>
        <text x={padL - 2} y={padT + plotH} textAnchor="end" fontSize={6} fill="var(--text-muted)" fontFamily="var(--font-mono)">
          0
        </text>
        {hasSalary && (
          <text x={padL + plotW + 2} y={padT + 3} textAnchor="start" fontSize={6} fill="#4ecdc4" fontFamily="var(--font-mono)">
            {salMax >= 1_000_000 ? `$${(salMax / 1_000_000).toFixed(0)}M` : `$${(salMax / 1_000).toFixed(0)}K`}
          </text>
        )}

        {/* X-axis season labels */}
        {data.map((d, i) => {
          const x = padL + i * xStep;
          const shortYr = d.season.length > 5 ? d.season.slice(2, 4) : d.season.slice(0, 2);
          return (
            <text key={d.season} x={x} y={H - 2} textAnchor="middle" fontSize={5.5} fill="var(--text-muted)" fontFamily="var(--font-mono)">
              {shortYr}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, paddingLeft: padL, marginTop: 1 }}>
        <span style={{ fontSize: 6, color: '#ff6b35', fontFamily: 'var(--font-mono)' }}>WS</span>
        {hasSalary && <span style={{ fontSize: 6, color: '#4ecdc4', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>Salary</span>}
      </div>
    </div>
  );
}

export function SeasonTable({ rows, onHeightChange, chartSignal = 0 }: { rows: SeasonDetailRow[]; onHeightChange?: (delta: number) => void; chartSignal?: number }) {
  const [expandedSeries, setExpandedSeries] = useState<{ season: string; opponentId: string } | null>(null);
  const [showValueChart, setShowValueChart] = useState(chartSignal > 0);
  const prevChartSignal = useRef(chartSignal);

  useEffect(() => {
    if (chartSignal !== prevChartSignal.current) {
      prevChartSignal.current = chartSignal;
      if (chartSignal > 0) {
        setShowValueChart(prev => {
          if (!prev) {
            onHeightChange?.(70);
            return true;
          }
          return prev;
        });
      }
    }
  }, [chartSignal, onHeightChange]);

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
    <>
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
          <th
            className="nopan nodrag"
            onClick={(e) => {
              e.stopPropagation();
              const VALUE_CHART_H = 70;
              onHeightChange?.(showValueChart ? -VALUE_CHART_H : VALUE_CHART_H);
              setShowValueChart(!showValueChart);
            }}
            style={{
              ...thStyle,
              color: showValueChart ? '#ff6b35' : '#5b9bd5',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            title="Toggle WS vs Salary chart"
          >
            WS
          </th>
          <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 5 }}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const shortSeason = r.season.length > 5 ? r.season.slice(2) : r.season;
          const compactTd: React.CSSProperties = { ...tdStyle, padding: '1px 2px' };
          return (
            <React.Fragment key={r.season}>
            <tr>
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
                  {r.playoffPeakGames && r.playoffPeakGames.length > 0 && (
                    <PeakBadge
                      game={r.playoffPeakGames[0]}
                      onClick={() => {
                        const peak = r.playoffPeakGames![0];
                        const isClosing = expandedSeries?.season === r.season && expandedSeries?.opponentId === peak.opponentId;
                        if (isClosing) {
                          // Closing current series
                          const series = r.playoffSeries?.find(s => s.opponentId === peak.opponentId);
                          if (series) onHeightChange?.(-(28 + series.games.length * 12));
                          setExpandedSeries(null);
                        } else {
                          // Close previous series if any
                          if (expandedSeries) {
                            const prevRow = rows.find(rr => rr.season === expandedSeries.season);
                            const prevSeries = prevRow?.playoffSeries?.find(s => s.opponentId === expandedSeries.opponentId);
                            if (prevSeries) onHeightChange?.(-(28 + prevSeries.games.length * 12));
                          }
                          // Open new series
                          const series = r.playoffSeries?.find(s => s.opponentId === peak.opponentId);
                          if (series) onHeightChange?.(28 + series.games.length * 12);
                          setExpandedSeries({ season: r.season, opponentId: peak.opponentId });
                        }
                      }}
                    />
                  )}
                </span>
              </td>
            </tr>
            {expandedSeries?.season === r.season && r.playoffSeries && (() => {
              const series = r.playoffSeries.find(s => s.opponentId === expandedSeries.opponentId);
              if (!series) return null;
              return (
                <tr key={`${r.season}-series`}>
                  <td colSpan={7} style={{ padding: '0 2px', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
                    <SeriesPanel series={series} />
                  </td>
                </tr>
              );
            })()}
          </React.Fragment>
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
    {showValueChart && <ValueChart rows={rows} />}
    </>
  );
}

