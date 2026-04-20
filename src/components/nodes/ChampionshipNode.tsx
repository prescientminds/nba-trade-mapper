'use client';

import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useGraphStore, ChampionshipNodeData, ChampionshipIngredients } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import { ensureReadable, contrastText } from '@/lib/colors';

const INGREDIENT_COLORS = {
  trade: '#f9c74f',
  draft: '#4ecdc4',
  tradedPick: '#ff6b35',
  fa: '#9b5de5',
};

function IngredientsBar({ ingredients }: { ingredients: ChampionshipIngredients }) {
  const segments = [
    { key: 'trade', pct: ingredients.tradePct, color: INGREDIENT_COLORS.trade, label: 'Trade' },
    { key: 'draft', pct: ingredients.draftPct, color: INGREDIENT_COLORS.draft, label: 'Draft' },
    { key: 'tradedPick', pct: ingredients.tradedPickPct, color: INGREDIENT_COLORS.tradedPick, label: 'Traded pick' },
    { key: 'fa', pct: ingredients.faPct, color: INGREDIENT_COLORS.fa, label: 'FA' },
  ].filter(s => s.pct >= 1);

  return (
    <div style={{ margin: '5px 0 2px' }}>
      {/* Bar */}
      <div style={{ display: 'flex', width: '100%', gap: 1, height: 10, marginBottom: 3 }}>
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            style={{
              width: `${seg.pct}%`,
              height: '100%',
              background: seg.color,
              borderRadius: i === 0 && segments.length === 1 ? 2
                : i === 0 ? '2px 0 0 2px'
                : i === segments.length - 1 ? '0 2px 2px 0' : 0,
            }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 6 }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ width: 5, height: 5, borderRadius: 1, background: s.color, flexShrink: 0 }} />
            <span style={{
              fontSize: 7,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-body)',
              letterSpacing: 0.2,
            }}>
              {s.label} {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChampionshipNodeComponent({ id, data }: NodeProps) {
  const {
    teamId,
    season,
    teamName,
    teamColor,
    players,
    inlinePlayers,
    ingredients,
    isChampionship,
    madePlayoffs,
  } = data as ChampionshipNodeData;

  // When seedChampionshipRoster predates the flag, fall back to presence of playoff data
  const hasPlayoffData = players.some(p => (p.playoffWs ?? 0) > 0 || (p.playoffGp ?? 0) > 0);
  const effectiveIsChampionship = isChampionship === true;
  const effectiveMadePlayoffs = madePlayoffs === undefined ? hasPlayoffData : madePlayoffs;

  const expandTradeNode = useGraphStore((s) => s.expandTradeNode);
  const expandChampionshipPlayer = useGraphStore((s) => s.expandChampionshipPlayer);
  const expandChampionshipPlayerAfter = useGraphStore((s) => s.expandChampionshipPlayerAfter);
  const expandChampionshipWeb = useGraphStore((s) => s.expandChampionshipWeb);
  const collapseChampionshipStaged = useGraphStore((s) => s.collapseChampionshipStaged);
  const expandInlineChampionshipPlayer = useGraphStore((s) => s.expandInlineChampionshipPlayer);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const nodes = useGraphStore((s) => s.nodes);
  const championshipContext = useGraphStore((s) => s.championshipContext);
  const followPath = useGraphStore((s) => s.followPath);
  const startFollowPathForPlayer = useGraphStore((s) => s.startFollowPathForPlayer);
  const exitFollowPath = useGraphStore((s) => s.exitFollowPath);
  const advanceFollowPath = useGraphStore((s) => s.advanceFollowPath);
  const retreatFollowPath = useGraphStore((s) => s.retreatFollowPath);
  const adjustLayoutForToggle = useGraphStore((s) => s.adjustLayoutForToggle);

  const [pathLoading, setPathLoading] = useState<string | null>(null);
  const [afterLoading, setAfterLoading] = useState<string | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [wsChartSignals, setWsChartSignals] = useState<Record<string, number>>({});
  // WS column mode: single season (default) vs total while on team
  const [wsMode, setWsMode] = useState<'season' | 'stint'>('season');

  const isExpanded = expandedNodes.has(id);
  const color = ensureReadable(teamColor || '#9b5de5');
  const hasInlineData = inlinePlayers && Object.keys(inlinePlayers).length > 0;
  const cardWidth = isExpanded ? (hasInlineData ? 260 : 220) : 220;

  const expandedPaths = championshipContext?.expandedPaths ?? new Set<string>();
  const playerPhases = championshipContext?.playerPhases ?? new Map<string, 'road' | 'full'>();

  // Check if a player's journey is on the graph
  const isPlayerOnGraph = (playerName: string): boolean => {
    if (expandedPaths.has(playerName)) return true;
    const slug = playerName.toLowerCase().replace(/\s+/g, '-');
    return nodes.some(n => n.id.startsWith(`stint-${slug}-`));
  };

  // Check if a player has post-championship stints
  const hasPostChampStints = (playerName: string): boolean => {
    const pd = championshipContext?.players.find(p => p.playerName === playerName);
    if (!pd) return false;
    return pd.championshipStintIndex < pd.allStints.length - 1;
  };

  // Roster sorted by the active WS mode — stint total when toggled, else the default order.
  const sortedPlayers = useMemo(() => {
    if (wsMode !== 'stint') return players;
    return [...players].sort((a, b) => (b.totalWinShares ?? -1) - (a.totalWinShares ?? -1));
  }, [players, wsMode]);

  // Season display
  const seasonEnd = useMemo(() => {
    const parts = season.split('-');
    if (parts.length === 2) {
      const startYear = parseInt(parts[0]);
      return isNaN(startYear) ? season : String(startYear + 1);
    }
    return season;
  }, [season]);

  const handlePathClick = async (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    if (pathLoading) return;

    // If already following this player, exit
    if (followPath?.playerName === playerName) {
      exitFollowPath();
      return;
    }

    // If not on graph, load career first
    if (!isPlayerOnGraph(playerName)) {
      setPathLoading(playerName);
      await expandChampionshipPlayer(playerName).finally(() => setPathLoading(null));
    }

    // Auto-start follow
    startFollowPathForPlayer(playerName);
  };

  const handleAfterClick = (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    if (afterLoading) return;
    setAfterLoading(playerName);
    expandChampionshipPlayerAfter(playerName).finally(() => setAfterLoading(null));
  };

  const handleInlineClick = (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    expandInlineChampionshipPlayer(id, playerName);
  };

  // Click the WS number → open inline panel (if not already) and fire chart signal
  // so SeasonTable auto-opens the WS-vs-Salary chart.
  const handleWsClick = (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    const already = !!inlinePlayers?.[playerName] && !inlinePlayers[playerName].isLoading;
    if (!already) expandInlineChampionshipPlayer(id, playerName);
    setWsChartSignals((prev) => ({ ...prev, [playerName]: (prev[playerName] ?? 0) + 1 }));
  };

  return (
    <div
      onClick={() => expandTradeNode(id)}
      style={{
        width: cardWidth,
        minHeight: isExpanded ? 80 : 60,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isExpanded ? color + '66' : 'var(--border-medium)'}`,
        borderTop: `3px solid ${color}`,
        cursor: 'pointer',
        transition: 'var(--transition-base)',
        boxShadow: isExpanded
          ? `0 0 20px ${color}22`
          : '0 2px 12px rgba(0,0,0,0.3)',
        padding: '6px 8px',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.boxShadow = `0 0 24px ${color}33`;
          e.currentTarget.style.borderColor = color + '88';
        }
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
          e.currentTarget.style.borderColor = 'var(--border-medium)';
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* + / - buttons — top-right corner */}
      <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, zIndex: 2 }}>
        {/* Collapse (-) */}
        <div
          className="nopan nodrag"
          onClick={(e) => { e.stopPropagation(); collapseChampionshipStaged(); }}
          style={{
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            fontSize: 13, fontWeight: 700, lineHeight: 1,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          {'\u2212'}
        </div>
        {/* Expand (+) — first press expands card, subsequent presses expand player paths */}
        <div
          className="nopan nodrag"
          onClick={(e) => {
            e.stopPropagation();
            if (expandLoading) return;
            if (!isExpanded) {
              expandTradeNode(id);
            } else {
              setExpandLoading(true);
              expandChampionshipWeb().finally(() => setExpandLoading(false));
            }
          }}
          style={{
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3,
            background: expandLoading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            color: expandLoading ? '#f9c74f' : 'var(--text-secondary)',
            fontSize: 13, fontWeight: 700, lineHeight: 1,
            cursor: expandLoading ? 'default' : 'pointer',
          }}
          onMouseEnter={(e) => { if (!expandLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = expandLoading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'; }}
        >
          {expandLoading ? (
            <div style={{
              width: 8, height: 8,
              border: '1.5px solid var(--text-muted)',
              borderTopColor: '#f9c74f',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          ) : '+'}
        </div>
      </div>

      {/* Header: trophy (champs only) + team badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingRight: 36 }}>
        {effectiveIsChampionship && (
          <span style={{ fontSize: 14, lineHeight: 1 }}>{'\uD83C\uDFC6'}</span>
        )}
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 999,
            background: teamColor,
            color: contrastText(teamColor),
            letterSpacing: 0.4,
          }}
        >
          {teamId}
        </span>
        <span
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono)',
            color: effectiveIsChampionship ? '#f9c74f' : 'var(--text-muted)',
            fontWeight: 700,
            marginLeft: 'auto',
          }}
        >
          {seasonEnd}
        </span>
      </div>

      {/* Team name */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: 0.3,
          lineHeight: 1.2,
          marginBottom: 2,
        }}
      >
        {teamName}
      </div>

      {/* Ingredients bar — trade / draft / FA breakdown */}
      {ingredients && (
        <IngredientsBar ingredients={ingredients} />
      )}

      {/* Collapsed: player count */}
      {!isExpanded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 8,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            {players.length} players
          </span>
        </div>
      )}

      {/* Expanded: roster list */}
      {isExpanded && (
        <div style={{ marginTop: 4 }}>
          {/* Section label */}
          <div
            style={{
              fontSize: 7,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              color: effectiveMadePlayoffs ? '#f9c74f' : 'var(--text-muted)',
              fontFamily: 'var(--font-body)',
              marginBottom: 2,
            }}
          >
            {effectiveMadePlayoffs ? 'Playoff Stats' : 'Season Stats'}
          </div>

          {/* Column headers — spacer at end matches Path/After button width */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '0 3px 2px',
          }}>
            <span style={{ flex: 1, fontSize: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Player
            </span>
            <span style={{ fontSize: 6, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0, width: 52, textAlign: 'right' }}>
              PPG/RPG/APG
            </span>
            <span
              className="nopan nodrag"
              onClick={(e) => {
                e.stopPropagation();
                setWsMode((m) => (m === 'season' ? 'stint' : 'season'));
              }}
              title={wsMode === 'season'
                ? 'Showing season WS — click to switch to total WS on team (sorted)'
                : 'Showing total WS on team — click to switch back to season WS (sorted)'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 2,
                fontSize: 6,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: 0.3,
                flexShrink: 0,
                width: wsMode === 'stint' ? 62 : 34,
                textAlign: 'right',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ color: wsMode === 'season' ? '#f9c74f' : 'rgba(255,255,255,0.3)', fontWeight: wsMode === 'season' ? 700 : 400 }}>
                WS
              </span>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 7 }}>/</span>
              <span style={{ color: wsMode === 'stint' ? '#ff6b35' : 'rgba(255,255,255,0.3)', fontWeight: wsMode === 'stint' ? 700 : 400, fontSize: 8 }}>
                ∑
              </span>
              {wsMode === 'stint' && (
                <span style={{ color: '#ff6b35', fontSize: 6, opacity: 0.75, marginLeft: 1 }}>
                  ({seasonEnd})
                </span>
              )}
              <svg width="6" height="6" viewBox="0 0 6 6" style={{ marginLeft: 1, opacity: 0.55 }}>
                <path d="M0 2 L3 0 L6 2 M0 4 L3 6 L6 4" fill="none" stroke="currentColor" strokeWidth="0.8" />
              </svg>
            </span>
            {/* Spacer matching Path/After/on-graph button */}
            <span style={{ flexShrink: 0, width: 28 }} />
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 -6px 4px' }} />

          {/* Player rows */}
          {sortedPlayers.map((player) => {
            const onGraph = isPlayerOnGraph(player.playerName);
            const isLoading = pathLoading === player.playerName;
            const isAfterLoading = afterLoading === player.playerName;
            const inlineData = inlinePlayers?.[player.playerName];
            const isInlineExpanded = !!inlineData && !inlineData.isLoading;
            const isInlineLoading = inlineData?.isLoading;
            const playerPhase = playerPhases.get(player.playerName);
            const canShowAfter = onGraph && playerPhase === 'road' && hasPostChampStints(player.playerName);

            return (
              <div key={player.playerName}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 3px',
                    borderRadius: 3,
                  }}
                >
                  {/* Player name — click for inline stats */}
                  <div
                    className="nopan nodrag"
                    onClick={(e) => handleInlineClick(e, player.playerName)}
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: isInlineExpanded ? 'var(--accent-orange)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    {player.playerName}
                  </div>

                  {/* Playoff stats (preferred) or regular season fallback */}
                  {(player.playoffPpg != null || player.avgPpg != null) && (
                    <span style={{
                      fontSize: 7,
                      fontFamily: 'var(--font-mono)',
                      color: player.playoffPpg != null ? 'var(--text-secondary)' : 'var(--text-muted)',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      width: 52,
                      textAlign: 'right',
                    }}>
                      {player.playoffPpg != null
                        ? `${player.playoffPpg.toFixed(1)}/${player.playoffRpg?.toFixed(1) ?? '-'}/${player.playoffApg?.toFixed(1) ?? '-'}`
                        : `${player.avgPpg!.toFixed(1)}/${player.avgRpg?.toFixed(1) ?? '-'}/${player.avgApg?.toFixed(1) ?? '-'}`
                      }
                    </span>
                  )}

                  {/* WS column — mode-aware. Click value to open WS-vs-Salary chart. */}
                  {(() => {
                    let wsValue: number | null = null;
                    let color = '#fff';
                    if (wsMode === 'stint') {
                      wsValue = player.totalWinShares;
                      color = '#ff6b35';
                    } else if (effectiveMadePlayoffs && player.playoffWs != null && player.playoffWs > 0) {
                      wsValue = player.playoffWs;
                      color = '#f9c74f';
                    } else {
                      wsValue = player.seasonWinShares;
                      color = '#fff';
                    }
                    if (wsValue == null) return <span style={{ width: 22, flexShrink: 0 }} />;
                    return (
                      <span
                        className="nopan nodrag"
                        onClick={(e) => handleWsClick(e, player.playerName)}
                        title="Open WS vs Salary chart"
                        style={{
                          fontSize: 7,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color,
                          flexShrink: 0,
                          width: 22,
                          textAlign: 'right',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        {wsValue.toFixed(1)}
                      </span>
                    );
                  })()}

                  {/* Inline loading */}
                  {isInlineLoading && (
                    <div style={{
                      width: 8, height: 8,
                      border: '1.5px solid var(--text-muted)',
                      borderTopColor: 'var(--accent-orange)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      flexShrink: 0,
                    }} />
                  )}

                  {/* Path / After buttons */}
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {followPath?.playerName === player.playerName ? (
                      <div
                        className="nopan nodrag"
                        onClick={(e) => handlePathClick(e, player.playerName)}
                        style={{
                          fontSize: 8,
                          color: '#f9c74f',
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'rgba(249,199,79,0.12)',
                          cursor: 'pointer',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(249,199,79,0.25)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(249,199,79,0.12)'; }}
                      >
                        {'\u2715'} Path
                      </div>
                    ) : (
                      <div
                        className="nopan nodrag"
                        onClick={(e) => handlePathClick(e, player.playerName)}
                        style={{
                          fontSize: 8,
                          color: isLoading ? 'var(--accent-orange)' : 'var(--text-muted)',
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'var(--bg-tertiary)',
                          cursor: isLoading ? 'default' : 'pointer',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isLoading) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                          e.currentTarget.style.color = isLoading ? 'var(--accent-orange)' : 'var(--text-muted)';
                        }}
                      >
                        {isLoading ? (
                          <div style={{
                            width: 8, height: 8,
                            border: '1.5px solid var(--text-muted)',
                            borderTopColor: 'var(--accent-orange)',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }} />
                        ) : 'Path'}
                      </div>
                    )}
                    {canShowAfter && (
                      <div
                        className="nopan nodrag"
                        onClick={(e) => handleAfterClick(e, player.playerName)}
                        style={{
                          fontSize: 8,
                          color: isAfterLoading ? '#f9c74f' : 'var(--text-muted)',
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'var(--bg-tertiary)',
                          cursor: isAfterLoading ? 'default' : 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isAfterLoading) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                            e.currentTarget.style.color = '#f9c74f';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                          e.currentTarget.style.color = isAfterLoading ? '#f9c74f' : 'var(--text-muted)';
                        }}
                      >
                        {isAfterLoading ? (
                          <div style={{
                            width: 8, height: 8,
                            border: '1.5px solid var(--text-muted)',
                            borderTopColor: '#f9c74f',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }} />
                        ) : 'After'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline stats panel */}
                {isInlineExpanded && inlineData.seasonDetails && (
                  <div
                    style={{
                      marginTop: 3,
                      marginBottom: 3,
                      padding: '3px 5px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 3,
                      borderLeft: '2px solid var(--accent-orange)',
                    }}
                  >
                    <div style={{
                      fontSize: 8,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {inlineData.teamId} · {inlineData.seasons[0]}
                      {inlineData.seasons.length > 1 ? ` – ${inlineData.seasons[inlineData.seasons.length - 1]}` : ''}
                      {inlineData.avgPpg !== null && (
                        <span style={{ marginLeft: 6 }}>
                          {inlineData.avgPpg.toFixed(1)}/{inlineData.avgRpg?.toFixed(1) ?? '--'}/{inlineData.avgApg?.toFixed(1) ?? '--'}
                        </span>
                      )}
                    </div>
                    <SeasonTable
                      rows={inlineData.seasonDetails}
                      onHeightChange={(delta) => adjustLayoutForToggle(id, delta)}
                      chartSignal={wsChartSignals[player.playerName] ?? 0}
                      currentSeason={season}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Follow indicator — Back button (left side, hidden at first stop) */}
      {followPath && followPath.currentIndex > 0 && followPath.orderedNodeIds[followPath.currentIndex] === id && (
        <div
          className="nopan nodrag"
          onClick={(e) => { e.stopPropagation(); retreatFollowPath(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: -8,
            top: '50%',
            transform: 'translate(-100%, -50%)',
            fontSize: 9,
            fontWeight: 600,
            color: '#f9c74f',
            background: 'rgba(249,199,79,0.15)',
            border: '1px solid rgba(249,199,79,0.3)',
            borderRadius: 4,
            padding: '1px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            zIndex: 10,
            animation: 'pulse-gold 2s ease-in-out infinite',
          }}
        >
          {'\u25C0 Back'}
        </div>
      )}

      {/* Follow indicator — pulsing gold ▼ Next button */}
      {followPath && followPath.orderedNodeIds[followPath.currentIndex] === id && (
        <div
          className="nopan nodrag"
          onClick={(e) => { e.stopPropagation(); advanceFollowPath(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: -18,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 9,
            fontWeight: 600,
            color: '#f9c74f',
            background: 'rgba(249,199,79,0.15)',
            border: '1px solid rgba(249,199,79,0.3)',
            borderRadius: 4,
            padding: '1px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            zIndex: 10,
            animation: 'pulse-gold 2s ease-in-out infinite',
          }}
        >
          {followPath.currentIndex < followPath.orderedNodeIds.length - 1 ? '\u25BC Next' : '\u25CF'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(ChampionshipNodeComponent);
