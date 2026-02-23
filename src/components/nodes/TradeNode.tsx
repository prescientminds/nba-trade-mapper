'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TEAMS, getTeamDisplayInfo } from '@/lib/teams';
import { useGraphStore, TradeNodeData } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import type { TransactionAsset } from '@/lib/supabase';
import { ensureReadable, contrastText } from '@/lib/colors';
import { getSupabase } from '@/lib/supabase';

interface TradeScoreRow {
  team_scores: Record<string, { score: number }>;
  winner: string | null;
  lopsidedness: number;
}

function TradeNodeComponent({ id, data }: NodeProps) {
  const { trade, teamColors, teamIds, inlinePlayers } = data as TradeNodeData;
  const expandTradeNode = useGraphStore((s) => s.expandTradeNode);
  const expandPlayerFullPathFromTrade = useGraphStore((s) => s.expandPlayerFullPathFromTrade);
  const expandInlineTradePlayer = useGraphStore((s) => s.expandInlineTradePlayer);
  const removeNode = useGraphStore((s) => s.removeNode);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const loadingNodes = useGraphStore((s) => s.loadingNodes);
  const coreNodes = useGraphStore((s) => s.coreNodes);
  const nodes = useGraphStore((s) => s.nodes);

  const isExpanded = expandedNodes.has(id);
  const isLoading = loadingNodes.has(id);
  const isCore = coreNodes.has(id);
  const primaryColor = teamColors[0] || '#ff6b35';

  // Trade score — fetched lazily when card first expands
  const [tradeScore, setTradeScore] = useState<TradeScoreRow | null>(null);
  const [scoreFetched, setScoreFetched] = useState(false);
  const [scoreTooltipOpen, setScoreTooltipOpen] = useState(false);
  useEffect(() => {
    if (!isExpanded || scoreFetched) return;
    setScoreFetched(true);
    getSupabase()
      .from('trade_scores')
      .select('team_scores,winner,lopsidedness')
      .eq('trade_id', trade.id)
      .single()
      .then(({ data }) => { if (data) setTradeScore(data as TradeScoreRow); });
  }, [isExpanded, scoreFetched, trade.id]);
  const hasInlineData = inlinePlayers && Object.keys(inlinePlayers).length > 0;
  const cardWidth = hasInlineData ? 300 : 240;

  const dateStr = trade.date
    ? new Date(trade.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  // Heading: "Lakers & Celtics" or "3-Team Trade"
  const tradeHeading = useMemo(() => {
    if (teamIds.length === 2) {
      const n1 = getTeamDisplayInfo(teamIds[0], trade.date)?.name.split(' ').pop() || teamIds[0];
      const n2 = getTeamDisplayInfo(teamIds[1], trade.date)?.name.split(' ').pop() || teamIds[1];
      return `${n1} & ${n2}`;
    }
    if (teamIds.length >= 3) return `${teamIds.length}-Team Trade`;
    return trade.title;
  }, [teamIds, trade.title, trade.date]);

  // Subtitle: unique player names involved, max 3 + overflow count
  const playerSubtitle = useMemo(() => {
    if (!trade.transaction_assets) return '';
    const seen = new Set<string>();
    const names: string[] = [];
    for (const a of trade.transaction_assets) {
      if (a.asset_type === 'player' && a.player_name && !seen.has(a.player_name)) {
        seen.add(a.player_name);
        names.push(a.player_name);
      }
    }
    if (names.length === 0) return '';
    return names.length <= 3
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }, [trade.transaction_assets]);

  // Collapsed summary: "3P 2Pk" instead of "X assets"
  const collapsedSummary = useMemo(() => {
    if (!trade.transaction_assets) return null;
    const seen = new Set<string>();
    let players = 0;
    let picks = 0;
    for (const a of trade.transaction_assets) {
      const key = `${a.asset_type}|${a.player_name ?? ''}|${a.pick_year ?? ''}|${a.from_team_id ?? ''}|${a.to_team_id ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (a.asset_type === 'player') players++;
      else if (a.asset_type === 'pick' || a.asset_type === 'swap') picks++;
    }
    const parts: string[] = [];
    if (players > 0) parts.push(`${players}P`);
    if (picks > 0) parts.push(`${picks}Pk`);
    return parts.length > 0 ? parts.join(' ') : null;
  }, [trade.transaction_assets]);

  // Group assets by receiving team (deduplicated)
  const assetsByTeam = useMemo(() => {
    if (!trade.transaction_assets) return {};
    const groups: Record<string, TransactionAsset[]> = {};
    const seen = new Set<string>();
    for (const asset of trade.transaction_assets) {
      const key = `${asset.asset_type}|${asset.player_name ?? ''}|${asset.pick_year ?? ''}|${asset.from_team_id ?? ''}|${asset.to_team_id ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const team = asset.to_team_id || 'Unknown';
      if (!groups[team]) groups[team] = [];
      groups[team].push(asset);
    }
    return groups;
  }, [trade.transaction_assets]);

  // Score entries sorted best → worst, null if no meaningful data
  const scoreEntries = useMemo(() => {
    if (!tradeScore) return null;
    const entries = Object.entries(tradeScore.team_scores)
      .sort((a, b) => b[1].score - a[1].score);
    if (entries.every(([, ts]) => ts.score === 0)) return null;
    return entries;
  }, [tradeScore]);

  const maxScore = useMemo(() => {
    if (!scoreEntries) return 1;
    return Math.max(...scoreEntries.map(([, ts]) => ts.score), 0.01);
  }, [scoreEntries]);

  // Check if an asset's forward stint/node is already on canvas
  const isInGraph = (asset: TransactionAsset) => {
    if (asset.asset_type === 'player' && asset.player_name && asset.to_team_id) {
      // Player journey is on graph if their PlayerNode or any stint at the receiving team exists
      const playerSlug = asset.player_name.toLowerCase().replace(/\s+/g, '-');
      if (nodes.some((n) => n.id === `player-${playerSlug}`)) return true;
      const prefix = `stint-${playerSlug}-${asset.to_team_id}`;
      return nodes.some((n) => n.id.startsWith(prefix));
    }
    if ((asset.asset_type === 'pick' || asset.asset_type === 'swap') && asset.pick_year) {
      const pkid = `pick-${asset.transaction_id}-${asset.id}`;
      return nodes.some((n) => n.id === pkid);
    }
    return false;
  };

  const handlePathClick = (e: React.MouseEvent, asset: TransactionAsset) => {
    e.stopPropagation();
    if (isInGraph(asset)) return;
    expandPlayerFullPathFromTrade(id, asset);
  };

  const handleInlineClick = (e: React.MouseEvent, asset: TransactionAsset) => {
    e.stopPropagation();
    expandInlineTradePlayer(id, asset);
  };

  return (
    <div
      onClick={() => expandTradeNode(id)}
      style={{
        width: cardWidth,
        minHeight: isExpanded ? 80 : 56,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isExpanded ? primaryColor + '66' : 'var(--border-medium)'}`,
        borderTop: `3px solid ${primaryColor}`,
        cursor: 'pointer',
        transition: 'var(--transition-base)',
        boxShadow: isExpanded
          ? `0 0 20px ${primaryColor}22`
          : '0 4px 20px rgba(0,0,0,0.3)',
        padding: '6px 8px',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.boxShadow = `0 0 24px ${primaryColor}33`;
          e.currentTarget.style.borderColor = primaryColor + '88';
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

      {/* X close button — only for non-core nodes */}
      {!isCore && isExpanded && !isLoading && (
        <div
          className="nopan nodrag"
          onClick={(e) => { e.stopPropagation(); removeNode(id); }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            zIndex: 2,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          ✕
        </div>
      )}

      {/* Date */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--accent-orange)',
          marginBottom: 3,
          letterSpacing: '0.5px',
        }}
      >
        {dateStr}
      </div>

      {/* Heading: Nickname A & Nickname B */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          lineHeight: 1.15,
          color: 'var(--text-primary)',
          letterSpacing: '0.5px',
          marginBottom: playerSubtitle ? 2 : 4,
        }}
      >
        {tradeHeading}
      </div>

      {/* Subtitle: player names */}
      {playerSubtitle && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.3,
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playerSubtitle}
        </div>
      )}

      {/* Team badges — solid filled pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {teamIds.map((tid) => {
          const displayInfo = getTeamDisplayInfo(tid, trade.date);
          const bg = displayInfo.color;
          const textColor = contrastText(bg);
          // Very dark colors (e.g. BKN black) get a subtle white outline so they're
          // visible against the card's dark background
          const needsOutline = 0.299 * parseInt(bg.slice(1,3),16) + 0.587 * parseInt(bg.slice(3,5),16) + 0.114 * parseInt(bg.slice(5,7),16) < 30;
          return (
            <span
              key={tid}
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: bg,
                color: textColor,
                letterSpacing: 0.4,
                border: needsOutline ? '1px solid rgba(255,255,255,0.25)' : 'none',
              }}
            >
              {displayInfo.abbreviation}
            </span>
          );
        })}
        {!isExpanded && collapsedSummary && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              padding: '1px 5px',
              borderRadius: 999,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-muted)',
              marginLeft: 'auto',
            }}
          >
            {collapsedSummary}
          </span>
        )}
      </div>

      {/* Expanded: score key + asset list */}
      {isExpanded && (
        <div style={{ marginTop: 6 }}>
          {/* Trade value — compact key at top */}
          {scoreEntries && (
            <div style={{ marginBottom: 5 }}>
              {/* Section label + info icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <span style={{
                  fontSize: 8, fontWeight: 600, letterSpacing: 0.8,
                  textTransform: 'uppercase', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-body)',
                }}>
                  Trade Score
                </span>
                <span
                  className="nopan nodrag"
                  onClick={(e) => { e.stopPropagation(); setScoreTooltipOpen((v) => !v); }}
                  onMouseEnter={() => setScoreTooltipOpen(true)}
                  onMouseLeave={() => setScoreTooltipOpen(false)}
                  style={{
                    width: 12, height: 12,
                    borderRadius: '50%',
                    border: '1px solid var(--border-medium)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8, fontStyle: 'italic',
                    fontFamily: 'Georgia, serif',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  i
                </span>
              </div>

              {/* Inline formula explanation */}
              {scoreTooltipOpen && (
                <div
                  className="nopan nodrag"
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 4,
                    padding: '6px 8px',
                    marginBottom: 6,
                    borderLeft: '2px solid var(--border-medium)',
                  }}
                >
                  <div style={{
                    fontSize: 9, fontWeight: 700,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    marginBottom: 3,
                  }}>
                    How is Trade Score calculated?
                  </div>
                  <div style={{
                    fontSize: 9, color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-body)', lineHeight: 1.55,
                  }}>
                    Each player: Win Shares + (VORP × 0.5) + (Playoff WS × 1.5) + (Championships × 5) + accolade bonus.
                  </div>
                  <div style={{
                    fontSize: 8, color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', marginTop: 4, lineHeight: 1.5,
                  }}>
                    MVP +5 · DPOY +2.5 · ROY +1.5{'\n'}
                    All-NBA 1st +2 · 2nd +1.2 · 3rd +0.7{'\n'}
                    All-Defensive +0.5 · All-Star +0.3
                  </div>
                </div>
              )}

              {/* Bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {scoreEntries.map(([teamId, ts]) => {
                  const scoreDisplayInfo = getTeamDisplayInfo(teamId, trade.date);
                  const color = ensureReadable(scoreDisplayInfo.color);
                  const pct = (ts.score / maxScore) * 100;
                  const isWinner = teamId === tradeScore!.winner;
                  return (
                    <div key={teamId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 700,
                        color: isWinner ? color : 'var(--text-muted)',
                        width: 22, flexShrink: 0,
                      }}>
                        {scoreDisplayInfo.abbreviation}
                      </span>
                      <div style={{
                        flex: 1, height: 2,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 1, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: isWinner ? color : 'rgba(255,255,255,0.15)',
                          borderRadius: 1,
                          transition: 'width 0.5s ease-out',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 8, fontFamily: 'var(--font-mono)',
                        color: isWinner ? color : 'var(--text-muted)',
                        width: 24, textAlign: 'right', flexShrink: 0,
                      }}>
                        {ts.score.toFixed(1)}
                      </span>
                      <span style={{ width: 8, flexShrink: 0 }}>
                        {isWinner && tradeScore!.lopsidedness >= 1.5 && (
                          <span style={{ fontSize: 8, color }}>↑</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Separator */}
          <div
            style={{
              height: 1,
              background: 'var(--border-subtle)',
              margin: '0 -4px 6px',
            }}
          />

          {Object.entries(assetsByTeam).map(([teamId, assets]) => {
            const teamDisplayInfo = getTeamDisplayInfo(teamId, trade.date);
            const teamColor = ensureReadable(teamDisplayInfo.color);
            const teamName = teamDisplayInfo.name;

            const hasRenderableAssets = assets.some((a) => {
              if (a.asset_type === 'cash' || a.asset_type === 'exception') return true;
              if (a.asset_type === 'player' && a.player_name) return true;
              if ((a.asset_type === 'pick' || a.asset_type === 'swap') && (a.pick_year || a.became_player_name)) return true;
              return false;
            });

            return (
              <div key={teamId} style={{ marginBottom: 6 }}>
                {/* Team header */}
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    color: teamColor,
                    marginBottom: 3,
                  }}
                >
                  {teamName} receives
                </div>

                {/* No data fallback for old trades with incomplete records */}
                {!hasRenderableAssets && (
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      padding: '2px 4px',
                      opacity: 0.7,
                    }}
                  >
                    No player data for this era
                  </div>
                )}

                {/* Assets */}
                {hasRenderableAssets && assets.map((asset) => {
                  const inGraph = isInGraph(asset);
                  const isCash = asset.asset_type === 'cash' || asset.asset_type === 'exception';
                  const isPlayer = asset.asset_type === 'player' && asset.player_name;
                  const isPick =
                    (asset.asset_type === 'pick' || asset.asset_type === 'swap') &&
                    (asset.pick_year || asset.became_player_name);

                  if (isCash) {
                    return (
                      <div
                        key={asset.id}
                        style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          padding: '2px 4px',
                          opacity: 0.6,
                        }}
                      >
                        {asset.asset_type === 'cash' ? 'Cash' : 'Trade exception'}
                      </div>
                    );
                  }

                  if (isPlayer) {
                    const playerName = asset.player_name!;
                    const inlineData = inlinePlayers?.[playerName];
                    const isInlineExpanded = !!inlineData && !inlineData.isLoading;
                    const isInlineLoading = inlineData?.isLoading;

                    return (
                      <div key={asset.id}>
                        {/* Player row: name (click→inline) + Path button (click→graph) */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 4,
                            padding: '2px 4px',
                            borderRadius: 3,
                          }}
                        >
                          {/* Clickable player name → inline stats toggle */}
                          <div
                            className="nopan nodrag"
                            onClick={(e) => handleInlineClick(e, asset)}
                            style={{
                              fontSize: 11,
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
                              if (!isInlineExpanded) e.currentTarget.style.color = 'var(--text-primary)';
                              e.currentTarget.style.textDecoration = 'underline';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = isInlineExpanded ? 'var(--accent-orange)' : 'var(--text-primary)';
                              e.currentTarget.style.textDecoration = 'none';
                            }}
                          >
                            {playerName}
                          </div>

                          {/* Inline loading indicator */}
                          {isInlineLoading && (
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                border: '1.5px solid var(--text-muted)',
                                borderTopColor: 'var(--accent-orange)',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                                flexShrink: 0,
                              }}
                            />
                          )}

                          {/* Path button: show full career path (both before and after this trade) */}
                          {!inGraph ? (
                            <div
                              className="nopan nodrag"
                              onClick={(e) => handlePathClick(e, asset)}
                              style={{
                                fontSize: 9,
                                color: 'var(--text-muted)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                background: 'var(--bg-tertiary)',
                                cursor: 'pointer',
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                                transition: 'background 0.15s, color 0.15s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.color = 'var(--text-primary)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--bg-tertiary)';
                                e.currentTarget.style.color = 'var(--text-muted)';
                              }}
                            >
                              Path
                            </div>
                          ) : (
                            <span style={{ fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>
                              on graph
                            </span>
                          )}
                        </div>

                        {/* Inline stats panel */}
                        {isInlineExpanded && inlineData.seasonDetails && (
                          <div
                            style={{
                              marginTop: 4,
                              marginBottom: 4,
                              padding: '4px 6px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: 4,
                              borderLeft: '2px solid var(--accent-orange)',
                            }}
                          >
                            {/* Stint summary */}
                            <div style={{
                              fontSize: 9,
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
                            <SeasonTable rows={inlineData.seasonDetails} />
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Pick / swap assets
                  let label = '';
                  let sublabel = '';
                  if (isPick) {
                    if (asset.pick_year) {
                      const year = asset.pick_year;
                      const round = asset.pick_round ?? '?';
                      const orig = asset.original_team_id ?? asset.from_team_id ?? '??';
                      label = `${year} R${round} (${orig})`;
                      if (asset.became_player_name) {
                        sublabel = `→ ${asset.became_player_name}`;
                      }
                    } else if (asset.became_player_name) {
                      // Historical pick with no year data — show only who it became
                      label = asset.became_player_name;
                      sublabel = 'Draft pick';
                    }
                  }

                  // No usable data — skip rather than render an empty row
                  if (!label) return null;

                  return (
                    <div
                      key={asset.id}
                      onClick={(e) => handlePathClick(e, asset)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        fontWeight: 500,
                        color: inGraph ? 'var(--text-muted)' : 'var(--text-primary)',
                        padding: '2px 4px',
                        borderRadius: 3,
                        cursor: inGraph ? 'default' : 'pointer',
                        opacity: inGraph ? 0.5 : 1,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (!inGraph) e.currentTarget.style.background = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div>
                        <div>{label}</div>
                        {sublabel && (
                          <div style={{ fontSize: 9, color: 'var(--accent-gold)', fontWeight: 400 }}>
                            {sublabel}
                          </div>
                        )}
                      </div>
                      {!inGraph && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>&rarr;</span>
                      )}
                      {inGraph && (
                        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>on graph</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}


        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 16,
            height: 16,
            border: `2px solid ${primaryColor}44`,
            borderTopColor: primaryColor,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}

      {/* Expand hint */}
      {!isExpanded && !isLoading && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 6,
            fontSize: 8,
            color: 'var(--text-muted)',
          }}
        >
          click to expand
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(TradeNodeComponent);
