'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { loadTrade } from '@/lib/trade-data';
import type { League } from '@/lib/league';

// ── Types ─────────────────────────────────────────────────────────────

interface TradeAsset {
  type: string;
  player_name: string | null;
  from_team_id: string;
  to_team_id: string;
  pick_year: number | null;
  became_player_name: string | null;
}

interface PlayerSeasonRow {
  player_name: string;
  team_id: string;
  season: string;
  win_shares: number | null;
}

/** Per-player per-season WS for one team's side of the trade */
interface TeamSide {
  teamId: string;
  teamName: string;
  teamColor: string;
  players: {
    name: string;
    seasons: { season: string; ws: number }[];
    totalWs: number;
  }[];
  seasonTotals: number[]; // indexed by year offset (0–4)
}

interface Props {
  tradeId: string;
  league: League;
  winner1yr: string | null;
  winner5yr: string | null;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

function seasonToYear(s: string): number {
  return parseInt(s.split('-')[0], 10);
}

function yearToSeason(y: number): string {
  return `${y}-${String(y + 1).slice(2)}`;
}

/** Lighten/darken a hex color for stacked layer variation */
function adjustColor(hex: string, index: number, total: number): string {
  const base = parseInt(hex.replace('#', ''), 16);
  const r = (base >> 16) & 0xff;
  const g = (base >> 8) & 0xff;
  const b = base & 0xff;
  // Vary opacity from 1.0 (biggest player) down to 0.35
  const opacity = total <= 1 ? 0.85 : 0.85 - (index / total) * 0.5;
  return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`;
}

// ── Component ─────────────────────────────────────────────────────────

export default function VerdictFlipTimeline({ tradeId, league, winner1yr, winner5yr, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topSide, setTopSide] = useState<TeamSide | null>(null);
  const [bottomSide, setBottomSide] = useState<TeamSide | null>(null);
  const [tradeTitle, setTradeTitle] = useState('');
  const [tradeSeason, setTradeSeason] = useState('');
  const [hoveredPlayer, setHoveredPlayer] = useState<{ name: string; season: string; ws: number; teamId: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    async function fetchData() {
      try {
        // Load the trade to get assets
        const trade = await loadTrade(tradeId, league);
        if (!trade) { setError('Trade not found'); return; }

        setTradeTitle(trade.title || 'Trade');
        setTradeSeason(trade.season);

        const tradeYear = seasonToYear(trade.season);
        const assets = trade.assets as TradeAsset[];

        // Group players by receiving team
        const teamPlayers = new Map<string, string[]>();
        for (const asset of assets) {
          if (asset.type === 'cash' || asset.type === 'swap') continue;
          const teamId = asset.to_team_id;
          let playerName: string | null = null;
          if (asset.type === 'player' && asset.player_name) {
            playerName = asset.player_name;
          } else if (asset.type === 'pick' && asset.became_player_name) {
            playerName = asset.became_player_name;
          }
          if (!playerName) continue;
          if (!teamPlayers.has(teamId)) teamPlayers.set(teamId, []);
          teamPlayers.get(teamId)!.push(playerName);
        }

        if (teamPlayers.size < 2) { setError('Need two teams'); return; }

        // Fetch player_seasons for all players in years 1-5 after trade
        const allPlayers = [...teamPlayers.values()].flat();
        const seasonRange: string[] = [];
        for (let y = tradeYear; y <= tradeYear + 5; y++) {
          seasonRange.push(yearToSeason(y));
        }

        const supabase = getSupabase();
        const { data: rows, error: fetchErr } = await supabase
          .from('player_seasons')
          .select('player_name, team_id, season, win_shares')
          .in('player_name', allPlayers)
          .in('season', seasonRange);

        if (fetchErr) { setError(fetchErr.message); return; }
        const playerRows = (rows || []) as PlayerSeasonRow[];

        // Build sides
        const teams = [...teamPlayers.keys()];
        const sides: TeamSide[] = teams.map(teamId => {
          const tradeDate = trade.date || `${tradeYear}-07-01`;
          const info = getAnyTeamDisplayInfo(teamId, tradeDate);
          const playerNames = teamPlayers.get(teamId) || [];

          const players = playerNames.map(name => {
            // Get this player's seasons on the receiving team
            const relevant = playerRows.filter(r =>
              r.player_name === name &&
              r.team_id === teamId &&
              seasonToYear(r.season) >= tradeYear &&
              seasonToYear(r.season) <= tradeYear + 5
            );

            const seasons = [];
            for (let y = tradeYear + 1; y <= tradeYear + 5; y++) {
              const s = yearToSeason(y);
              const row = relevant.find(r => r.season === s);
              seasons.push({ season: s, ws: row?.win_shares ?? 0 });
            }

            return {
              name,
              seasons,
              totalWs: seasons.reduce((sum, s) => sum + Math.max(0, s.ws), 0),
            };
          })
            .filter(p => p.totalWs > 0)
            .sort((a, b) => b.totalWs - a.totalWs);

          // Season totals (year offsets 0-4 → seasons 1-5)
          const seasonTotals = [0, 0, 0, 0, 0];
          for (const p of players) {
            p.seasons.forEach((s, i) => {
              seasonTotals[i] += Math.max(0, s.ws);
            });
          }

          return {
            teamId,
            teamName: info.name,
            teamColor: info.color || '#666',
            players,
            seasonTotals,
          };
        });

        // Top = team that won year 1 (early winner), Bottom = team that won year 5
        // If winner1yr matches, that team goes on top
        const earlyWinner = sides.find(s => s.teamId === winner1yr);
        const lateWinner = sides.find(s => s.teamId === winner5yr);

        if (earlyWinner && lateWinner && earlyWinner !== lateWinner) {
          setTopSide(earlyWinner);
          setBottomSide(lateWinner);
        } else {
          // Fallback: sort by year 1 total
          sides.sort((a, b) => b.seasonTotals[0] - a.seasonTotals[0]);
          setTopSide(sides[0]);
          setBottomSide(sides[1]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [tradeId, league, winner1yr, winner5yr]);

  // ── Chart dimensions ──

  const W = 560;
  const H = 400;
  const PAD_LEFT = 50;
  const PAD_RIGHT = 20;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 16;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const halfH = (H - PAD_TOP - PAD_BOTTOM) / 2;
  const midY = PAD_TOP + halfH;

  // ── Build SVG paths ──

  const { topPaths, bottomPaths, maxVal, seasonLabels } = useMemo(() => {
    if (!topSide || !bottomSide) return { topPaths: [], bottomPaths: [], maxVal: 1, seasonLabels: [] };

    const maxTop = Math.max(...topSide.seasonTotals, 0.1);
    const maxBottom = Math.max(...bottomSide.seasonTotals, 0.1);
    const maxVal = Math.max(maxTop, maxBottom);

    const tradeYear = seasonToYear(tradeSeason);
    const seasonLabels = Array.from({ length: 5 }, (_, i) => yearToSeason(tradeYear + 1 + i));

    function buildStackedPaths(side: TeamSide, direction: 'up' | 'down') {
      const paths: { path: string; color: string; playerName: string; seasonValues: number[] }[] = [];
      // Stack players bottom-to-top (largest on bottom, closest to axis)
      const players = [...side.players];

      // Running baseline per season
      const baseline = [0, 0, 0, 0, 0];

      for (let pi = 0; pi < players.length; pi++) {
        const player = players[pi];
        const yValues = player.seasons.map(s => Math.max(0, s.ws));

        // Build area between baseline and baseline + this player's values
        const points: { x: number; yBot: number; yTop: number }[] = [];
        for (let si = 0; si < 5; si++) {
          const x = PAD_LEFT + (si / 4) * chartW;
          const bot = baseline[si];
          const top = bot + yValues[si];
          points.push({ x, yBot: bot, yTop: top });
        }

        // Convert to SVG y coordinates
        const svgPoints = points.map(p => ({
          x: p.x,
          yBot: direction === 'up'
            ? midY - (p.yBot / maxVal) * halfH
            : midY + (p.yBot / maxVal) * halfH,
          yTop: direction === 'up'
            ? midY - (p.yTop / maxVal) * halfH
            : midY + (p.yTop / maxVal) * halfH,
        }));

        // Build closed path: top edge forward, bottom edge backward
        const topEdge = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yTop.toFixed(1)}`).join(' ');
        const bottomEdge = [...svgPoints].reverse().map((p, i) => `${i === 0 ? 'L' : 'L'} ${p.x.toFixed(1)} ${p.yBot.toFixed(1)}`).join(' ');
        const pathD = `${topEdge} ${bottomEdge} Z`;

        paths.push({
          path: pathD,
          color: adjustColor(side.teamColor, pi, players.length),
          playerName: player.name,
          seasonValues: yValues,
        });

        // Advance baseline
        for (let si = 0; si < 5; si++) {
          baseline[si] += yValues[si];
        }
      }

      return paths;
    }

    const topPaths = buildStackedPaths(topSide, 'up');
    const bottomPaths = buildStackedPaths(bottomSide, 'down');

    return { topPaths, bottomPaths, maxVal, seasonLabels };
  }, [topSide, bottomSide, tradeSeason, chartW, halfH, midY]);

  // ── Cumulative running totals for crossover annotation ──

  const { crossoverSeason } = useMemo(() => {
    if (!topSide || !bottomSide) return { crossoverSeason: -1 };
    let cumTop = 0, cumBottom = 0;
    let crossoverSeason = -1;
    for (let i = 0; i < 5; i++) {
      cumTop += topSide.seasonTotals[i];
      cumBottom += bottomSide.seasonTotals[i];
      if (cumBottom > cumTop && crossoverSeason === -1) {
        crossoverSeason = i;
      }
    }
    return { crossoverSeason };
  }, [topSide, bottomSide]);

  // ── Render ──

  if (loading) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 40 }}>
            Loading timeline...
          </div>
        </div>
      </div>
    );
  }

  if (error || !topSide || !bottomSide) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ color: 'var(--accent-red)', fontSize: 12, textAlign: 'center', padding: 40 }}>
            {error || 'Could not load timeline data'}
          </div>
        </div>
      </div>
    );
  }

  const tradeYear = seasonToYear(tradeSeason);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={modalStyle}
        onClick={e => e.stopPropagation()}
        onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 10, right: 12,
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 18, cursor: 'pointer', lineHeight: 1,
            padding: '2px 6px', borderRadius: 4,
          }}
        >
          x
        </button>

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)', marginBottom: 2,
          }}>
            {tradeTitle}
          </div>
          <div style={{
            fontSize: 10, color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
          }}>
            Win Shares by season, years 1-5 after trade
          </div>
        </div>

        {/* Team labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, padding: '0 4px' }}>
          <TeamLabel side={topSide} subtitle="Won year 1" />
          <TeamLabel side={bottomSide} subtitle="Won year 5" />
        </div>

        {/* SVG Chart */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', maxWidth: W }}
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(frac => {
            const yUp = midY - frac * halfH;
            const yDown = midY + frac * halfH;
            return (
              <g key={frac}>
                <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={yUp} y2={yUp}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
                <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={yDown} y2={yDown}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
              </g>
            );
          })}

          {/* Center axis */}
          <line
            x1={PAD_LEFT} x2={W - PAD_RIGHT}
            y1={midY} y2={midY}
            stroke="rgba(255,255,255,0.25)" strokeWidth={1}
          />

          {/* Y-axis labels */}
          {[0.5, 1].map(frac => {
            const val = (frac * maxVal).toFixed(0);
            const yUp = midY - frac * halfH;
            const yDown = midY + frac * halfH;
            return (
              <g key={frac}>
                <text x={PAD_LEFT - 6} y={yUp + 3} textAnchor="end"
                  fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
                  {val}
                </text>
                <text x={PAD_LEFT - 6} y={yDown + 3} textAnchor="end"
                  fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
                  {val}
                </text>
              </g>
            );
          })}
          <text x={PAD_LEFT - 6} y={midY + 3} textAnchor="end"
            fill="var(--text-muted)" fontSize={8} fontFamily="var(--font-mono)">
            0
          </text>

          {/* Top side (early winner) — grows upward */}
          {topPaths.map((p, i) => (
            <path
              key={`top-${i}`}
              d={p.path}
              fill={p.color}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              opacity={hoveredPlayer && hoveredPlayer.name !== p.playerName ? 0.3 : 1}
              onMouseEnter={() => {
                const bestSeason = p.seasonValues.reduce((best, ws, si) =>
                  ws > best.ws ? { ws, si } : best, { ws: 0, si: 0 });
                setHoveredPlayer({
                  name: p.playerName,
                  season: seasonLabels[bestSeason.si] || '',
                  ws: p.seasonValues.reduce((a, b) => a + b, 0),
                  teamId: topSide.teamId,
                });
              }}
              onMouseLeave={() => setHoveredPlayer(null)}
            />
          ))}

          {/* Bottom side (late winner) — grows downward */}
          {bottomPaths.map((p, i) => (
            <path
              key={`bot-${i}`}
              d={p.path}
              fill={p.color}
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={0.5}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              opacity={hoveredPlayer && hoveredPlayer.name !== p.playerName ? 0.3 : 1}
              onMouseEnter={() => {
                const bestSeason = p.seasonValues.reduce((best, ws, si) =>
                  ws > best.ws ? { ws, si } : best, { ws: 0, si: 0 });
                setHoveredPlayer({
                  name: p.playerName,
                  season: seasonLabels[bestSeason.si] || '',
                  ws: p.seasonValues.reduce((a, b) => a + b, 0),
                  teamId: bottomSide.teamId,
                });
              }}
              onMouseLeave={() => setHoveredPlayer(null)}
            />
          ))}

          {/* Season labels on x-axis */}
          {seasonLabels.map((label, i) => {
            const x = PAD_LEFT + (i / 4) * chartW;
            return (
              <text key={label} x={x} y={H - 2} textAnchor="middle"
                fill="var(--text-muted)" fontSize={9} fontFamily="var(--font-mono)">
                Yr {i + 1}
              </text>
            );
          })}

          {/* Crossover marker */}
          {crossoverSeason >= 0 && (
            <g>
              <line
                x1={PAD_LEFT + (crossoverSeason / 4) * chartW}
                x2={PAD_LEFT + (crossoverSeason / 4) * chartW}
                y1={PAD_TOP} y2={H - PAD_BOTTOM}
                stroke="var(--accent-gold)" strokeWidth={1} strokeDasharray="4 3"
                opacity={0.6}
              />
              <text
                x={PAD_LEFT + (crossoverSeason / 4) * chartW}
                y={PAD_TOP - 2}
                textAnchor="middle"
                fill="var(--accent-gold)" fontSize={8} fontFamily="var(--font-body)"
                fontWeight={600}
              >
                FLIP
              </text>
            </g>
          )}

          {/* Vertical dividers at each season */}
          {[0, 1, 2, 3, 4].map(i => (
            <line key={i}
              x1={PAD_LEFT + (i / 4) * chartW}
              x2={PAD_LEFT + (i / 4) * chartW}
              y1={midY - 4} y2={midY + 4}
              stroke="rgba(255,255,255,0.3)" strokeWidth={1}
            />
          ))}
        </svg>

        {/* Player legend */}
        <div style={{
          display: 'flex', gap: 24, marginTop: 12,
          fontSize: 10, fontFamily: 'var(--font-body)',
        }}>
          <PlayerLegend side={topSide} />
          <PlayerLegend side={bottomSide} />
        </div>

        {/* Hover tooltip */}
        {hoveredPlayer && (
          <div style={{
            position: 'fixed',
            left: mousePos.x + 12,
            top: mousePos.y - 28,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-medium)',
            borderRadius: 6,
            padding: '5px 9px',
            fontSize: 10,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)',
            pointerEvents: 'none',
            zIndex: 10000,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontWeight: 600 }}>{hoveredPlayer.name}</span>
            <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
              {hoveredPlayer.ws.toFixed(1)} WS total
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function TeamLabel({ side, subtitle }: { side: TeamSide; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 10, height: 10, borderRadius: 2,
        backgroundColor: side.teamColor,
      }} />
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}>
          {side.teamName}
        </div>
        <div style={{
          fontSize: 8, color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)', textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function PlayerLegend({ side }: { side: TeamSide }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)',
        marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6,
      }}>
        {side.teamName.split(' ').pop()}
      </div>
      {side.players.slice(0, 6).map((p, i) => (
        <div key={p.name} style={{
          display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: 1,
            backgroundColor: adjustColor(side.teamColor, i, side.players.length),
            flexShrink: 0,
          }} />
          <span style={{ color: 'var(--text-tertiary)', flex: 1 }}>{p.name}</span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
            {p.totalWs.toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9000,
  background: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  position: 'relative',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-medium)',
  borderRadius: 'var(--radius-lg)',
  padding: '20px 24px 16px',
  maxWidth: 620,
  width: '100%',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
};
