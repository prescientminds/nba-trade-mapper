'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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

interface TeamSeasonRow {
  team_id: string;
  season: string;
  wins: number;
  losses: number;
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
  teamWins: (number | null)[]; // team wins per season (0–4), null if no data
}

interface Props {
  tradeId: string;
  league: League;
  winner1yr?: string | null;
  winner5yr?: string | null;
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
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
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
        const allTeamIds = [...teamPlayers.keys()];

        const [playerRes, teamRes] = await Promise.all([
          supabase
            .from('player_seasons')
            .select('player_name, team_id, season, win_shares')
            .in('player_name', allPlayers)
            .in('season', seasonRange),
          supabase
            .from('team_seasons')
            .select('team_id, season, wins, losses')
            .in('team_id', allTeamIds)
            .in('season', seasonRange),
        ]);

        if (playerRes.error) { setError(playerRes.error.message); return; }
        const playerRows = (playerRes.data || []) as PlayerSeasonRow[];
        const teamSeasonRows = (teamRes.data || []) as TeamSeasonRow[];

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

          // Team wins per season
          const teamWins: (number | null)[] = [];
          for (let y = tradeYear + 1; y <= tradeYear + 5; y++) {
            const s = yearToSeason(y);
            const row = teamSeasonRows.find(r => r.team_id === teamId && r.season === s);
            teamWins.push(row ? row.wins : null);
          }

          return {
            teamId,
            teamName: info.name,
            teamColor: info.color || '#666',
            players,
            seasonTotals,
            teamWins,
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
  const WINS_H = 70;    // height of the wins strip at top
  const WINS_GAP = 12;  // gap between wins strip and WS chart
  const WS_H = 340;     // height of the mirrored WS stacked area
  const H = WINS_H + WINS_GAP + WS_H + 20; // total SVG height
  const PAD_LEFT = 50;
  const PAD_RIGHT = 36;  // room for right-side wins axis
  const PAD_TOP = 14;
  const PAD_BOTTOM = 16;
  const chartW = W - PAD_LEFT - PAD_RIGHT;

  // WS chart zone
  const wsTop = WINS_H + WINS_GAP;
  const wsAreaH = WS_H - PAD_BOTTOM;
  const halfH = wsAreaH / 2;
  const midY = wsTop + halfH;

  // Wins strip zone
  const winsTop = PAD_TOP;
  const winsBottom = WINS_H;

  // ── Build SVG paths ──

  const { topPaths, bottomPaths, maxVal, seasonLabels, topWinsPoints, bottomWinsPoints, winsScaleMin, winsScaleMax } = useMemo(() => {
    if (!topSide || !bottomSide) return { topPaths: [], bottomPaths: [], maxVal: 1, seasonLabels: [], topWinsPoints: [] as { x: number; y: number; wins: number }[], bottomWinsPoints: [] as { x: number; y: number; wins: number }[], winsScaleMin: 0, winsScaleMax: 82 };

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

    // Wins line data
    const allWins = [...topSide.teamWins, ...bottomSide.teamWins].filter((w): w is number => w !== null);
    const winsMax = allWins.length > 0 ? Math.max(...allWins) : 82;
    const winsMin = allWins.length > 0 ? Math.min(...allWins) : 0;
    // Scale with padding: floor to nearest 10 below min, ceil to nearest 10 above max
    const winsScaleMin = Math.max(0, Math.floor(winsMin / 10) * 10 - 5);
    const winsScaleMax = Math.min(82, Math.ceil(winsMax / 10) * 10 + 5);
    const winsRange = winsScaleMax - winsScaleMin || 1;

    function winsToPoints(wins: (number | null)[]): { x: number; y: number; wins: number }[] {
      return wins
        .map((w, i) => {
          if (w === null) return null;
          const x = PAD_LEFT + (i / 4) * chartW;
          const y = winsBottom - ((w - winsScaleMin) / winsRange) * (winsBottom - winsTop);
          return { x, y, wins: w };
        })
        .filter((p): p is { x: number; y: number; wins: number } => p !== null);
    }

    const topWinsPoints = winsToPoints(topSide.teamWins);
    const bottomWinsPoints = winsToPoints(bottomSide.teamWins);

    return { topPaths, bottomPaths, maxVal, seasonLabels, winsMax: winsScaleMax, topWinsPoints, bottomWinsPoints, winsScaleMin, winsScaleMax };
  }, [topSide, bottomSide, tradeSeason, chartW, halfH, midY, winsTop, winsBottom]);

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

  // ── Share / Download ──

  const handleShare = useCallback(async () => {
    if (!captureRef.current || sharing) return;
    setSharing(true);
    try {
      // Hide the close and share buttons during capture
      const buttons = captureRef.current.querySelectorAll('[data-capture-hide]');
      buttons.forEach(b => (b as HTMLElement).style.display = 'none');

      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(captureRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#16161f',
        scrollX: 0,
        scrollY: 0,
      });

      buttons.forEach(b => (b as HTMLElement).style.display = '');

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
      });

      // Try native share on mobile, fall back to download
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'trade-timeline.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([blob], 'trade-timeline.png', { type: 'image/png' })],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trade-timeline-${tradeId.slice(0, 8)}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  }, [sharing, tradeId]);

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
        ref={captureRef}
        style={modalStyle}
        onClick={e => e.stopPropagation()}
        onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        {/* Close button */}
        <button
          data-capture-hide
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
          <TeamLabel side={topSide} subtitle={winner1yr && winner5yr ? 'Won year 1' : undefined} />
          <TeamLabel side={bottomSide} subtitle={winner1yr && winner5yr ? 'Won year 5' : undefined} />
        </div>

        {/* SVG Chart */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', maxWidth: W }}
        >
          {/* ── Wins strip ── */}
          {/* Wins background */}
          <rect
            x={PAD_LEFT} y={winsTop} width={chartW} height={winsBottom - winsTop}
            fill="rgba(255,255,255,0.02)" rx={4}
          />

          {/* Wins grid lines */}
          {(() => {
            const range = winsScaleMax - winsScaleMin;
            const step = range > 30 ? 20 : 10;
            const lines: number[] = [];
            for (let w = Math.ceil(winsScaleMin / step) * step; w <= winsScaleMax; w += step) {
              lines.push(w);
            }
            return lines.map(w => {
              const y = winsBottom - ((w - winsScaleMin) / (winsScaleMax - winsScaleMin || 1)) * (winsBottom - winsTop);
              return (
                <g key={`wgrid-${w}`}>
                  <line x1={PAD_LEFT} x2={PAD_LEFT + chartW} y1={y} y2={y}
                    stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
                  <text x={W - PAD_RIGHT + 5} y={y + 3} textAnchor="start"
                    fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-mono)">
                    {w}W
                  </text>
                </g>
              );
            });
          })()}

          {/* "WINS" label */}
          <text x={W - PAD_RIGHT + 5} y={winsTop + 4} textAnchor="start"
            fill="var(--text-muted)" fontSize={7} fontFamily="var(--font-body)"
            fontWeight={600} letterSpacing={0.6}>
            WINS
          </text>

          {/* Top team wins line */}
          {topWinsPoints.length > 1 && (
            <polyline
              points={topWinsPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={topSide.teamColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          )}
          {topWinsPoints.map((p, i) => (
            <g key={`tw-${i}`}>
              <circle cx={p.x} cy={p.y} r={3.5}
                fill={topSide.teamColor} stroke="var(--bg-card)" strokeWidth={1.5} />
              <text x={p.x} y={p.y - 7} textAnchor="middle"
                fill={topSide.teamColor} fontSize={7} fontFamily="var(--font-mono)"
                fontWeight={600}>
                {p.wins}
              </text>
            </g>
          ))}

          {/* Bottom team wins line */}
          {bottomWinsPoints.length > 1 && (
            <polyline
              points={bottomWinsPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={bottomSide.teamColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          )}
          {bottomWinsPoints.map((p, i) => {
            // If close to a top point at same x, put label below dot instead of above
            const topPoint = topWinsPoints[i];
            const tooClose = topPoint && Math.abs(topPoint.y - p.y) < 14;
            return (
              <g key={`bw-${i}`}>
                <circle cx={p.x} cy={p.y} r={3.5}
                  fill={bottomSide.teamColor} stroke="var(--bg-card)" strokeWidth={1.5} />
                <text x={p.x} y={tooClose ? p.y + 12 : p.y - 7} textAnchor="middle"
                  fill={bottomSide.teamColor} fontSize={7} fontFamily="var(--font-mono)"
                  fontWeight={600}>
                  {p.wins}
                </text>
              </g>
            );
          })}

          {/* Separator between wins strip and WS chart */}
          <line x1={PAD_LEFT} x2={PAD_LEFT + chartW}
            y1={WINS_H + WINS_GAP / 2} y2={WINS_H + WINS_GAP / 2}
            stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />

          {/* ── WS stacked area chart ── */}

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
                y1={winsTop} y2={H - PAD_BOTTOM}
                stroke="var(--accent-gold)" strokeWidth={1} strokeDasharray="4 3"
                opacity={0.6}
              />
              <text
                x={PAD_LEFT + (crossoverSeason / 4) * chartW}
                y={winsTop - 2}
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

        {/* Share / Download button */}
        <div data-capture-hide style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <button
            onClick={handleShare}
            disabled={sharing}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 14px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: sharing ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: sharing ? 'wait' : 'pointer',
              letterSpacing: 0.4,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!sharing) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8v5a1 1 0 001 1h6a1 1 0 001-1V8" />
              <polyline points="8 2 8 10" />
              <polyline points="5 5 8 2 11 5" />
            </svg>
            {sharing ? 'Saving...' : 'Save Image'}
          </button>
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

function TeamLabel({ side, subtitle }: { side: TeamSide; subtitle?: string }) {
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
        {subtitle && (
          <div style={{
            fontSize: 8, color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}>
            {subtitle}
          </div>
        )}
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
