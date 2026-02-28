'use client';

import { memo, useMemo, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getAnyTeam, getAnyTeamDisplayInfo } from '@/lib/teams';
import { useGraphStore, TradeNodeData } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import type { TransactionAsset } from '@/lib/supabase';
import { ensureReadable, contrastText } from '@/lib/colors';
import { getSupabase } from '@/lib/supabase';

interface TradeScoreRow {
  team_scores: Record<string, { score: number; assets?: { name: string; type?: string; seasons?: number; ws?: number; playoff_ws?: number; championships?: number; accolades?: string[]; score: number }[] }>;
  winner: string | null;
  lopsidedness: number;
}

function TradeNodeComponent({ id, data }: NodeProps) {
  const { trade, teamColors, teamIds, inlinePlayers } = data as TradeNodeData;
  const expandTradeNode = useGraphStore((s) => s.expandTradeNode);
  const expandPlayerFullPathFromTrade = useGraphStore((s) => s.expandPlayerFullPathFromTrade);
  const expandInlineTradePlayer = useGraphStore((s) => s.expandInlineTradePlayer);
  const expandWeb = useGraphStore((s) => s.expandWeb);
  const collapseWeb = useGraphStore((s) => s.collapseWeb);
  const removeNode = useGraphStore((s) => s.removeNode);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const loadingNodes = useGraphStore((s) => s.loadingNodes);
  const coreNodes = useGraphStore((s) => s.coreNodes);
  const nodes = useGraphStore((s) => s.nodes);

  const [expandLoading, setExpandLoading] = useState(false);

  const isExpanded = expandedNodes.has(id);
  const isLoading = loadingNodes.has(id);
  const isCore = coreNodes.has(id);
  const primaryColor = teamColors[0] || '#ff6b35';

  // Trade score — fetched lazily when card first expands
  const [tradeScore, setTradeScore] = useState<TradeScoreRow | null>(null);
  const [scoreFetched, setScoreFetched] = useState(false);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreTooltipOpen, setScoreTooltipOpen] = useState(false);
  useEffect(() => {
    if (!isExpanded || scoreFetched) return;
    setScoreFetched(true);
    setScoreLoading(true);
    getSupabase()
      .from('trade_scores')
      .select('team_scores,winner,lopsidedness')
      .eq('trade_id', trade.id)
      .single()
      .then(({ data }) => { if (data) setTradeScore(data as TradeScoreRow); setScoreLoading(false); });
  }, [isExpanded, scoreFetched, trade.id]);
  const hasInlineData = inlinePlayers && Object.keys(inlinePlayers).length > 0;
  const cardWidth = hasInlineData ? 320 : 180;

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
      const n1 = getAnyTeamDisplayInfo(teamIds[0], trade.date)?.name.split(' ').pop() || teamIds[0];
      const n2 = getAnyTeamDisplayInfo(teamIds[1], trade.date)?.name.split(' ').pop() || teamIds[1];
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
      const key = `${a.asset_type}|${a.player_name ?? ''}|${a.pick_year ?? ''}|${a.from_team_id ?? ''}|${a.to_team_id ?? ''}|${a.became_player_name ?? ''}|${a.notes ?? ''}`;
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
      const key = `${asset.asset_type}|${asset.player_name ?? ''}|${asset.pick_year ?? ''}|${asset.from_team_id ?? ''}|${asset.to_team_id ?? ''}|${asset.became_player_name ?? ''}|${asset.notes ?? ''}`;
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

  // Look up per-asset score from trade_scores data
  const getAssetScore = (teamId: string, assetName: string | null | undefined): number | null => {
    if (!tradeScore || !assetName) return null;
    const teamData = tradeScore.team_scores[teamId];
    if (!teamData?.assets) return null;
    const found = teamData.assets.find((a) => a.name === assetName);
    return found && found.score > 0 ? found.score : null;
  };

  // Check if an asset's forward stint/node is already on canvas
  const isInGraph = (asset: TransactionAsset) => {
    if (asset.asset_type === 'player' && asset.player_name) {
      // Player journey is on graph if their PlayerNode or ANY stint exists
      // (covers players traded to a team they never played for, e.g. Beverley → UTA)
      const playerSlug = asset.player_name.toLowerCase().replace(/\s+/g, '-');
      if (nodes.some((n) => n.id === `player-${playerSlug}`)) return true;
      const stintPrefix = `stint-${playerSlug}-`;
      return nodes.some((n) => n.id.startsWith(stintPrefix));
    }
    if ((asset.asset_type === 'pick' || asset.asset_type === 'swap') && asset.pick_year) {
      const pkid = `pick-${asset.transaction_id}-${asset.id}`;
      if (nodes.some((n) => n.id === pkid)) return true;
      // Picks that resolved to a player: check if that player's stints/trades are on graph
      if (asset.became_player_name) {
        const pickSlug = asset.became_player_name.toLowerCase().replace(/\s+/g, '-');
        if (nodes.some((n) => n.id === `player-${pickSlug}`)) return true;
        if (nodes.some((n) => n.id.startsWith(`stint-${pickSlug}-`))) return true;
      }
      return false;
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
        minHeight: isExpanded ? 60 : 44,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isExpanded ? primaryColor + '66' : 'var(--border-medium)'}`,
        borderTop: `2px solid ${primaryColor}`,
        cursor: 'pointer',
        transition: 'var(--transition-base)',
        boxShadow: isExpanded
          ? `0 0 16px ${primaryColor}22`
          : '0 2px 12px rgba(0,0,0,0.3)',
        padding: '4px 6px',
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

      {/* + / − buttons — top-right corner, always visible */}
      {!isLoading && (
        <div style={{ position: 'absolute', top: 4, right: (isExpanded && !isCore) ? 24 : 4, display: 'flex', gap: 2, zIndex: 2 }}>
          {/* Collapse (−) */}
          <div
            className="nopan nodrag"
            onClick={(e) => { e.stopPropagation(); collapseWeb(id); }}
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
            −
          </div>
          {/* Expand (+) — first press expands card, subsequent presses expand web */}
          <div
            className="nopan nodrag"
            onClick={(e) => {
              e.stopPropagation();
              if (expandLoading) return;
              if (!isExpanded) {
                expandTradeNode(id);
              } else {
                setExpandLoading(true);
                expandWeb(id).finally(() => setExpandLoading(false));
              }
            }}
            style={{
              width: 16, height: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 3,
              background: expandLoading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
              color: expandLoading ? 'var(--accent-orange)' : 'var(--text-secondary)',
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
                borderTopColor: 'var(--accent-orange)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            ) : '+'}
          </div>
        </div>
      )}

      {/* Date */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          color: 'var(--accent-orange)',
          marginBottom: 2,
          letterSpacing: '0.4px',
        }}
      >
        {dateStr}
      </div>

      {/* Heading: Nickname A & Nickname B */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 11,
          lineHeight: 1.15,
          color: 'var(--text-primary)',
          letterSpacing: '0.4px',
          marginBottom: playerSubtitle ? 1 : 2,
        }}
      >
        {tradeHeading}
      </div>

      {/* Subtitle: player names */}
      {playerSubtitle && (
        <div
          style={{
            fontSize: 8,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.3,
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playerSubtitle}
        </div>
      )}

      {/* Team badges — solid filled pills */}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        {teamIds.map((tid) => {
          const displayInfo = getAnyTeamDisplayInfo(tid, trade.date);
          const bg = displayInfo.color;
          const textColor = contrastText(bg);
          const needsOutline = 0.299 * parseInt(bg.slice(1,3),16) + 0.587 * parseInt(bg.slice(3,5),16) + 0.114 * parseInt(bg.slice(5,7),16) < 30;
          return (
            <span
              key={tid}
              style={{
                fontSize: 8,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 999,
                background: bg,
                color: textColor,
                letterSpacing: 0.3,
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
              fontSize: 8,
              fontWeight: 500,
              padding: '1px 4px',
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
        <div style={{ marginTop: 4 }}>
          {/* Score loading */}
          {scoreLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <div style={{
                width: 10, height: 10,
                border: '1.5px solid var(--text-muted)',
                borderTopColor: 'var(--accent-orange)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Loading score…</span>
            </div>
          )}

          {/* Trade value — compact key at top */}
          {scoreEntries && (
            <div style={{ marginBottom: 4 }}>
              {/* Section label + info icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                <span style={{
                  fontSize: 7, fontWeight: 600, letterSpacing: 0.7,
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {scoreEntries.map(([teamId, ts]) => {
                  const scoreDisplayInfo = getAnyTeamDisplayInfo(teamId, trade.date);
                  const color = ensureReadable(scoreDisplayInfo.color);
                  const pct = (ts.score / maxScore) * 100;
                  const isWinner = teamId === tradeScore!.winner;
                  return (
                    <div key={teamId} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700,
                        color: isWinner ? color : 'var(--text-muted)',
                        width: 20, flexShrink: 0,
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
                        fontSize: 7, fontFamily: 'var(--font-mono)',
                        color: isWinner ? color : 'var(--text-muted)',
                        width: 22, textAlign: 'right', flexShrink: 0,
                      }}>
                        {ts.score.toFixed(1)}
                      </span>
                      <span style={{ width: 7, flexShrink: 0 }}>
                        {isWinner && tradeScore!.lopsidedness >= 1.5 && (
                          <span style={{ fontSize: 7, color }}>↑</span>
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
              margin: '0 -4px 4px',
            }}
          />

          {Object.entries(assetsByTeam).map(([teamId, assets]) => {
            const teamDisplayInfo = getAnyTeamDisplayInfo(teamId, trade.date);
            const teamColor = ensureReadable(teamDisplayInfo.color);
            const teamName = teamDisplayInfo.name;

            const hasRenderableAssets = assets.some((a) => {
              if (a.asset_type === 'cash' || a.asset_type === 'exception') return true;
              if (a.asset_type === 'player' && a.player_name) return true;
              if ((a.asset_type === 'pick' || a.asset_type === 'swap') && (a.pick_year || a.became_player_name)) return true;
              return false;
            });

            return (
              <div key={teamId} style={{ marginBottom: 4 }}>
                {/* Team header */}
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    color: teamColor,
                    marginBottom: 2,
                  }}
                >
                  {teamName} receives
                </div>

                {/* No data fallback for old trades with incomplete records */}
                {!hasRenderableAssets && (
                  <div
                    style={{
                      fontSize: 8,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      padding: '1px 3px',
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
                          fontSize: 9,
                          color: 'var(--text-muted)',
                          padding: '1px 3px',
                          opacity: 0.6,
                        }}
                      >
                        {asset.asset_type === 'cash' ? 'Cash' : 'Trade exception'}
                      </div>
                    );
                  }

                  if (isPlayer) {
                    const playerName = asset.player_name!;
                    const playerScore = getAssetScore(teamId, playerName);
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
                            gap: 3,
                            padding: '1px 3px',
                            borderRadius: 3,
                          }}
                        >
                          {/* Clickable player name → inline stats toggle */}
                          <div
                            className="nopan nodrag"
                            onClick={(e) => handleInlineClick(e, asset)}
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              flex: 1,
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                              const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                              if (nameEl) nameEl.style.textDecoration = 'underline';
                              const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                              if (chevron) {
                                chevron.style.background = 'rgba(255,255,255,0.12)';
                                chevron.style.color = 'var(--text-primary)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                              if (nameEl) nameEl.style.textDecoration = 'none';
                              const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                              if (chevron) {
                                chevron.style.background = 'transparent';
                                chevron.style.color = isInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)';
                              }
                            }}
                          >
                            {/* Expand chevron indicator */}
                            <span
                              data-chevron
                              style={{
                                fontSize: 7,
                                color: isInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)',
                                transition: 'transform 0.2s, color 0.15s, background 0.15s',
                                transform: isInlineExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                lineHeight: 1,
                                flexShrink: 0,
                                width: 12,
                                height: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 2,
                                background: 'transparent',
                              }}
                            >
                              ▸
                            </span>
                            <span
                              data-name
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {playerName}
                            </span>
                          </div>

                          {/* Per-asset score */}
                          {playerScore !== null && (
                            <span style={{
                              fontSize: 7,
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                              flexShrink: 0,
                            }}>
                              {playerScore.toFixed(1)}
                            </span>
                          )}

                          {/* Inline loading indicator */}
                          {isInlineLoading && (
                            <div
                              style={{
                                width: 8,
                                height: 8,
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
                                fontSize: 8,
                                color: 'var(--text-muted)',
                                padding: '1px 4px',
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
                            <span style={{ fontSize: 7, color: 'var(--text-muted)', flexShrink: 0 }}>
                              on graph
                            </span>
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
                            {/* Stint summary */}
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

                  const pickScore = getAssetScore(teamId, asset.became_player_name);
                  const pickPlayerName = asset.became_player_name;
                  const pickInlineData = pickPlayerName ? inlinePlayers?.[pickPlayerName] : undefined;
                  const isPickInlineExpanded = !!pickInlineData && !pickInlineData.isLoading;
                  const isPickInlineLoading = pickInlineData?.isLoading;
                  const isPickNeverPlayed = pickInlineData?.neverPlayed;
                  // For historical picks where label IS the player name, make label clickable
                  const labelIsPlayer = !asset.pick_year && !!asset.became_player_name;
                  const canInline = !!pickPlayerName && !!asset.to_team_id;

                  return (
                    <div key={asset.id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 10,
                          fontWeight: 500,
                          color: inGraph ? 'var(--text-muted)' : 'var(--pick-yellow)',
                          padding: '1px 3px',
                          borderRadius: 3,
                          opacity: inGraph ? 0.5 : 1,
                          gap: 3,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {labelIsPlayer ? (
                            /* Historical pick — render like a player row: white name + chevron */
                            <div
                              className="nopan nodrag"
                              onClick={(e) => canInline ? handleInlineClick(e, asset) : undefined}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                                color: 'var(--text-primary)',
                                cursor: canInline ? 'pointer' : 'default',
                              }}
                              onMouseEnter={(e) => {
                                if (!canInline) return;
                                const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                                if (nameEl) nameEl.style.textDecoration = 'underline';
                                const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                                if (chevron) {
                                  chevron.style.background = 'rgba(255,255,255,0.12)';
                                  chevron.style.color = 'var(--text-primary)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                                if (nameEl) nameEl.style.textDecoration = 'none';
                                const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                                if (chevron) {
                                  chevron.style.background = 'transparent';
                                  chevron.style.color = isPickInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)';
                                }
                              }}
                            >
                              {canInline && (
                                <span
                                  data-chevron
                                  style={{
                                    fontSize: 7,
                                    color: isPickInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)',
                                    transition: 'transform 0.2s, color 0.15s, background 0.15s',
                                    transform: isPickInlineExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                    lineHeight: 1,
                                    flexShrink: 0,
                                    width: 12,
                                    height: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: 2,
                                    background: 'transparent',
                                  }}
                                >
                                  ▸
                                </span>
                              )}
                              <span data-name>{label}</span>
                            </div>
                          ) : (
                            <>
                              {/* Pick label: year/round/team in yellow */}
                              <div>{label}</div>
                              {/* Drafted player name underneath, indented, white, clickable */}
                              {sublabel && canInline ? (
                                <div
                                  className="nopan nodrag"
                                  onClick={(e) => handleInlineClick(e, asset)}
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 500,
                                    color: 'var(--text-primary)',
                                    cursor: 'pointer',
                                    paddingLeft: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 3,
                                  }}
                                  onMouseEnter={(e) => {
                                    const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                                    if (nameEl) nameEl.style.textDecoration = 'underline';
                                    const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                                    if (chevron) {
                                      chevron.style.background = 'rgba(255,255,255,0.12)';
                                      chevron.style.color = 'var(--text-primary)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    const nameEl = e.currentTarget.querySelector('[data-name]') as HTMLElement;
                                    if (nameEl) nameEl.style.textDecoration = 'none';
                                    const chevron = e.currentTarget.querySelector('[data-chevron]') as HTMLElement;
                                    if (chevron) {
                                      chevron.style.background = 'transparent';
                                      chevron.style.color = isPickInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)';
                                    }
                                  }}
                                >
                                  <span
                                    data-chevron
                                    style={{
                                      fontSize: 7,
                                      color: isPickInlineExpanded ? 'var(--accent-orange)' : 'var(--text-muted)',
                                      transition: 'transform 0.2s, color 0.15s, background 0.15s',
                                      transform: isPickInlineExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                      lineHeight: 1,
                                      flexShrink: 0,
                                      width: 12,
                                      height: 12,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      borderRadius: 2,
                                      background: 'transparent',
                                    }}
                                  >
                                    ▸
                                  </span>
                                  <span data-name>{sublabel}</span>
                                </div>
                              ) : sublabel ? (
                                <div style={{ fontSize: 10, color: 'var(--text-primary)', fontWeight: 500, paddingLeft: 8 }}>
                                  {sublabel}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                        {/* Per-asset score for picks */}
                        {pickScore !== null && (
                          <span style={{
                            fontSize: 7,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                          }}>
                            {pickScore.toFixed(1)}
                          </span>
                        )}
                        {/* Inline loading indicator */}
                        {isPickInlineLoading && (
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              border: '1.5px solid var(--text-muted)',
                              borderTopColor: 'var(--accent-orange)',
                              borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {!inGraph ? (
                          <div
                            className="nopan nodrag"
                            onClick={(e) => handlePathClick(e, asset)}
                            style={{
                              fontSize: 8,
                              color: 'var(--text-muted)',
                              padding: '1px 4px',
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
                          <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>on graph</span>
                        )}
                      </div>

                      {/* Inline stats panel for drafted player */}
                      {isPickInlineExpanded && !isPickNeverPlayed && pickInlineData.seasonDetails && (
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
                            {pickInlineData.teamId} · {pickInlineData.seasons[0]}
                            {pickInlineData.seasons.length > 1 ? ` – ${pickInlineData.seasons[pickInlineData.seasons.length - 1]}` : ''}
                            {pickInlineData.avgPpg !== null && (
                              <span style={{ marginLeft: 6 }}>
                                {pickInlineData.avgPpg.toFixed(1)}/{pickInlineData.avgRpg?.toFixed(1) ?? '--'}/{pickInlineData.avgApg?.toFixed(1) ?? '--'}
                              </span>
                            )}
                          </div>
                          <SeasonTable rows={pickInlineData.seasonDetails} />
                        </div>
                      )}

                      {/* "Never played" empty state */}
                      {isPickInlineExpanded && isPickNeverPlayed && (
                        <div
                          style={{
                            marginTop: 3,
                            marginBottom: 3,
                            padding: '4px 6px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: 3,
                            borderLeft: '2px solid var(--pick-yellow)',
                          }}
                        >
                          <div style={{
                            fontSize: 8,
                            color: 'var(--text-muted)',
                            fontStyle: 'italic',
                          }}>
                            No Games Played
                          </div>
                        </div>
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
          +
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(TradeNodeComponent);
