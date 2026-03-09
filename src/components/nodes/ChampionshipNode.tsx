'use client';

import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useGraphStore, ChampionshipNodeData } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import { ensureReadable, contrastText } from '@/lib/colors';

function ChampionshipNodeComponent({ id, data }: NodeProps) {
  const {
    teamId,
    season,
    teamName,
    teamColor,
    players,
    inlinePlayers,
  } = data as ChampionshipNodeData;

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
  const adjustLayoutForToggle = useGraphStore((s) => s.adjustLayoutForToggle);

  const [pathLoading, setPathLoading] = useState<string | null>(null);
  const [afterLoading, setAfterLoading] = useState<string | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

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

  // Season display
  const seasonEnd = useMemo(() => {
    const parts = season.split('-');
    if (parts.length === 2) {
      const startYear = parseInt(parts[0]);
      return isNaN(startYear) ? season : String(startYear + 1);
    }
    return season;
  }, [season]);

  const handlePathClick = (e: React.MouseEvent, playerName: string) => {
    e.stopPropagation();
    if (isPlayerOnGraph(playerName) || pathLoading) return;
    setPathLoading(playerName);
    expandChampionshipPlayer(playerName).finally(() => setPathLoading(null));
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

      {/* Header: trophy + team badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, paddingRight: 36 }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{'\uD83C\uDFC6'}</span>
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
            color: '#f9c74f',
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
              color: '#f9c74f',
              fontFamily: 'var(--font-body)',
              marginBottom: 2,
            }}
          >
            Playoff Stats
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
            <span style={{ fontSize: 6, color: '#f9c74f', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0, width: 16, textAlign: 'right' }}>
              WS
            </span>
            {/* Spacer matching Path/After/on-graph button */}
            <span style={{ flexShrink: 0, width: 28 }} />
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 -6px 4px' }} />

          {/* Player rows */}
          {players.map((player) => {
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

                  {/* Playoff WS */}
                  {player.playoffWs != null && player.playoffWs > 0 && (
                    <span style={{
                      fontSize: 7,
                      fontFamily: 'var(--font-mono)',
                      color: '#f9c74f',
                      flexShrink: 0,
                      width: 16,
                      textAlign: 'right',
                    }}>
                      {player.playoffWs.toFixed(1)}
                    </span>
                  )}

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

                  {/* Path / Follow / Following / After buttons */}
                  {!onGraph ? (
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
                  ) : followPath?.playerName === player.playerName ? (
                    <div
                      className="nopan nodrag"
                      onClick={(e) => { e.stopPropagation(); exitFollowPath(); }}
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
                      {'\u2715'} Following
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <div
                        className="nopan nodrag"
                        onClick={(e) => { e.stopPropagation(); startFollowPathForPlayer(player.playerName); }}
                        style={{
                          fontSize: 8,
                          color: 'var(--text-muted)',
                          padding: '1px 4px',
                          borderRadius: 3,
                          background: 'var(--bg-tertiary)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(249,199,79,0.15)';
                          e.currentTarget.style.color = '#f9c74f';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--bg-tertiary)';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                      >
                        Follow {'\u2192'}
                      </div>
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
                  )}
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
                    <SeasonTable rows={inlineData.seasonDetails} onHeightChange={(delta) => adjustLayoutForToggle(id, delta)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(ChampionshipNodeComponent);
