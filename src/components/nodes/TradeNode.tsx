'use client';

import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TEAMS } from '@/lib/teams';
import { useGraphStore, TradeNodeData } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import type { TransactionAsset } from '@/lib/supabase';
import { ensureReadable } from '@/lib/colors';

function TradeNodeComponent({ id, data }: NodeProps) {
  const { trade, teamColors, teamIds, inlinePlayers } = data as TradeNodeData;
  const expandTradeNode = useGraphStore((s) => s.expandTradeNode);
  const expandPlayerFromTrade = useGraphStore((s) => s.expandPlayerFromTrade);
  const expandPlayerHistoryFromTrade = useGraphStore((s) => s.expandPlayerHistoryFromTrade);
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
  const hasInlineData = inlinePlayers && Object.keys(inlinePlayers).length > 0;
  const cardWidth = hasInlineData ? 280 : 240;

  const dateStr = trade.date
    ? new Date(trade.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  // Contextual trade title
  const contextualTitle = useMemo(() => {
    if (teamIds.length === 2) return `Trade between ${teamIds[0]} and ${teamIds[1]}`;
    if (teamIds.length >= 3) return `${teamIds.length}-team trade: ${teamIds.join(', ')}`;
    return trade.title;
  }, [teamIds, trade.title]);

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

  // Check if a player's backward (history) stints are already on canvas.
  // Only checks from_team_id stints — not the PlayerNode — so that forward expansion
  // being on-graph doesn't incorrectly suppress the history button.
  const isHistoryInGraph = (asset: TransactionAsset) => {
    if (asset.asset_type === 'player' && asset.player_name && asset.from_team_id) {
      const playerSlug = asset.player_name.toLowerCase().replace(/\s+/g, '-');
      const prefix = `stint-${playerSlug}-${asset.from_team_id}`;
      return nodes.some((n) => n.id.startsWith(prefix));
    }
    return false;
  };

  const handlePathClick = (e: React.MouseEvent, asset: TransactionAsset) => {
    e.stopPropagation();
    if (isInGraph(asset)) return;
    expandPlayerFromTrade(id, asset);
  };

  const handleHistoryClick = (e: React.MouseEvent, asset: TransactionAsset) => {
    e.stopPropagation();
    if (isHistoryInGraph(asset)) return;
    expandPlayerHistoryFromTrade(id, asset);
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

      {/* Title */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          lineHeight: 1.2,
          color: 'var(--text-primary)',
          letterSpacing: '0.5px',
          marginBottom: 4,
        }}
        className="line-clamp-2"
      >
        {contextualTitle}
      </div>

      {/* Team badges */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {teamIds.map((tid) => {
          const team = TEAMS[tid];
          if (!team) return null;
          const readableColor = ensureReadable(team.color);
          return (
            <span
              key={tid}
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 999,
                background: readableColor + '22',
                color: readableColor,
                border: `1px solid ${readableColor}44`,
              }}
            >
              {tid}
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

      {/* Expanded: inline asset list */}
      {isExpanded && (
        <div style={{ marginTop: 6 }}>
          {/* Separator */}
          <div
            style={{
              height: 1,
              background: 'var(--border-subtle)',
              margin: '0 -4px 6px',
            }}
          />

          {Object.entries(assetsByTeam).map(([teamId, assets]) => {
            const team = TEAMS[teamId];
            const teamColor = ensureReadable(team?.color || '#666');
            const teamName = team?.name || teamId;

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

                {/* Assets */}
                {assets.map((asset) => {
                  const inGraph = isInGraph(asset);
                  const isCash = asset.asset_type === 'cash' || asset.asset_type === 'exception';
                  const isPlayer = asset.asset_type === 'player' && asset.player_name;
                  const isPick =
                    (asset.asset_type === 'pick' || asset.asset_type === 'swap') &&
                    asset.pick_year;

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

                          {/* ← History button: show backward trajectory (only for players with a from-team) */}
                          {asset.asset_type === 'player' && asset.from_team_id && (
                            !isHistoryInGraph(asset) ? (
                              <div
                                className="nopan nodrag"
                                onClick={(e) => handleHistoryClick(e, asset)}
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
                                &larr; Hist
                              </div>
                            ) : (
                              <span style={{ fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>
                                hist on
                              </span>
                            )
                          )}

                          {/* Path → button: add to graph */}
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
                              Path &rarr;
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
                    const year = asset.pick_year ?? '??';
                    const round = asset.pick_round ?? '?';
                    const orig = asset.original_team_id ?? asset.from_team_id ?? '??';
                    label = `${year} R${round} (${orig})`;
                    if (asset.became_player_name) {
                      sublabel = `Became: ${asset.became_player_name}`;
                    }
                  }

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
