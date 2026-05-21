'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { useGraphStore, HypotheticalTradeNodeData } from '@/lib/graph-store';
import { createHypotheticalShareLink } from '@/lib/share';
import { useMobile } from '@/lib/use-mobile';
import { track } from '@/lib/analytics';

const DRAFT_ACCENT = '#ff6b35';

function HypotheticalTradeNodeComponent({ id, data }: NodeProps) {
  const { teamIds, teamColors, sides, assetCounts, isWriting } = data as HypotheticalTradeNodeData;
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const removeNode = useGraphStore((s) => s.removeNode);
  const visualizeHypothetical = useGraphStore((s) => s.visualizeHypothetical);
  const comparableCount = useGraphStore(
    (s) => s.latestComparablesByNodeId.get(id)?.length ?? 0,
  );

  const [hovered, setHovered] = useState(false);
  const selected = writingNodeId === id || isWriting;
  const primaryColor = teamColors[0] || DRAFT_ACCENT;
  const sideColor = selected
    ? primaryColor
    : hovered
      ? primaryColor + '88'
      : 'var(--border-medium)';

  const heading = useMemo(() => {
    if (teamIds.length === 0) return 'New Trade';
    const names = teamIds.map(
      (tid) => getAnyTeamDisplayInfo(tid)?.name.split(' ').pop() || tid,
    );
    if (names.length === 1) return `${names[0]} & ?`;
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    // N≥3: Oxford-style — "CELTICS, SUNS & WIZARDS". Already uppercased
    // by the parent style, so we lean on standard comma + ampersand join.
    const head = names.slice(0, -1).join(', ');
    const tail = names[names.length - 1];
    return `${head} & ${tail}`;
  }, [teamIds]);

  /**
   * Per-side ledger rows for the live card body.
   *
   * Semantics: each side's row shows what that team RECEIVES — i.e. the
   * union of every OTHER side's outgoing players + picks. For a 2-team
   * trade this is a clean swap; for N≥3 teams (not yet built) it shows
   * total incoming. `playerNames`/`picks` on a `HypotheticalSide` are the
   * OUTGOING assets for that side, so the receive view inverts the index.
   */
  const ledgerRows = useMemo(() => {
    const safeSides = sides ?? [];
    const rowsWithTeam = safeSides
      .map((side, idx) => {
        if (!side) return null;
        if (!side.teamId) return null;
        const teamName =
          getAnyTeamDisplayInfo(side.teamId)?.name.split(' ').pop() || side.teamId;
        const incomingPlayers: string[] = [];
        const incomingPicks: typeof side.picks = [];
        safeSides.forEach((other, otherIdx) => {
          if (otherIdx === idx || !other) return;
          incomingPlayers.push(...(other.playerNames ?? []));
          incomingPicks.push(...(other.picks ?? []));
        });
        return { teamId: side.teamId, teamName, players: incomingPlayers, picks: incomingPicks };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return rowsWithTeam;
  }, [sides]);

  const hasAnyAssets = assetCounts.players > 0 || assetCounts.picks > 0;

  const handleEditToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setWritingNode(selected ? null : id);
  };

  return (
    <div
      data-hypothetical-trade-node
      className="hypothetical-trade-card"
      onClick={handleEditToggle}
      style={{
        width: 220,
        minHeight: 44,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        borderStyle: 'dashed',
        borderTopColor: primaryColor,
        borderRightColor: sideColor,
        borderBottomColor: sideColor,
        borderLeftColor: sideColor,
        borderTopWidth: '2px',
        borderRightWidth: '1.5px',
        borderBottomWidth: '1.5px',
        borderLeftWidth: '1.5px',
        cursor: 'pointer',
        transition: 'var(--transition-base)',
        boxShadow: selected
          ? `0 0 18px ${primaryColor}55`
          : hovered
            ? `0 0 22px ${primaryColor}33`
            : '0 2px 12px rgba(0,0,0,0.3)',
        padding: '4px 6px',
        fontFamily: 'var(--font-body)',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* DRAFT badge — top-left */}
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: 6,
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: '1px',
          color: '#0a0a0f',
          background: primaryColor,
          padding: '2px 6px',
          borderRadius: 3,
          zIndex: 2,
          lineHeight: 1,
        }}
      >
        DRAFT
      </div>

      {/* Close (X) — top-right */}
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

      {/* Heading */}
      <div
        style={{
          marginTop: 4,
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.4px',
          color: 'var(--text-primary)',
          textTransform: 'uppercase',
          lineHeight: 1.1,
          paddingRight: 22,
        }}
      >
        {heading}
      </div>

      {/* Live ledger — per-side receive list. Auto-grows with assets. */}
      {ledgerRows.length > 0 && hasAnyAssets && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ledgerRows.map((row) => {
            const isEmpty = row.players.length === 0 && row.picks.length === 0;
            return (
              <div key={row.teamId} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    lineHeight: 1.2,
                  }}
                >
                  {row.teamName} receives
                </div>
                {isEmpty ? (
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      paddingLeft: 6,
                      lineHeight: 1.3,
                    }}
                  >
                    nothing yet
                  </div>
                ) : (
                  <>
                    {row.players.map((name) => (
                      <div
                        key={`p-${name}`}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 10,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3,
                          paddingLeft: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={name}
                      >
                        • {name}
                      </div>
                    ))}
                    {row.picks.map((pick) => {
                      const roundLabel = pick.round === 1 ? '1st' : '2nd';
                      const tags: string[] = [];
                      if (pick.asset_class === 'swap') tags.push('swap');
                      else if (pick.conditional) tags.push('cond.');
                      const suffix = tags.length ? ` (${tags.join(', ')})` : '';
                      return (
                        <div
                          key={`pk-${pick.pick_key}`}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.3,
                            paddingLeft: 6,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={`${pick.year} ${pick.original_team_id} ${roundLabel}${suffix}`}
                        >
                          • {pick.year} {pick.original_team_id} {roundLabel}{suffix}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer — edit hint + Visualize/Share buttons. Sits below ledger or
          directly under heading when empty. The Visualize button gates on
          whether the side panel has computed comparables (published via
          setLatestComparables). Share gates on whether any assets have been
          added — sharing an empty draft is meaningless. */}
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <VisualizeButton
            nodeId={id}
            comparableCount={comparableCount}
            accent={primaryColor}
            onVisualize={() => visualizeHypothetical(id)}
          />
          <ShareNodeButton
            nodeId={id}
            hasAnyAssets={hasAnyAssets}
            comparableCount={comparableCount}
            accent={primaryColor}
          />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: selected ? primaryColor : 'var(--text-muted)',
            letterSpacing: '0.3px',
          }}
        >
          {selected ? '● editing' : 'click to edit'}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function VisualizeButton({
  nodeId,
  comparableCount,
  accent,
  onVisualize,
}: {
  nodeId: string;
  comparableCount: number;
  accent: string;
  onVisualize: () => void;
}) {
  const enabled = comparableCount > 0;
  return (
    <button
      type="button"
      className="nopan nodrag"
      data-visualize-button
      data-node-id={nodeId}
      disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation();
        if (enabled) onVisualize();
      }}
      title={enabled ? 'Spawn historical comparables on the canvas' : 'Open the editor and add players to compute comparables'}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: 3,
        border: `1px solid ${enabled ? accent : 'var(--border-subtle)'}`,
        background: enabled ? `${accent}1a` : 'transparent',
        color: enabled ? accent : 'var(--text-muted)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        transition: 'background 160ms ease, border-color 160ms ease',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        if (enabled) e.currentTarget.style.background = `${accent}33`;
      }}
      onMouseLeave={(e) => {
        if (enabled) e.currentTarget.style.background = `${accent}1a`;
      }}
    >
      Visualize{enabled ? ` (${comparableCount})` : ''}
    </button>
  );
}

type ShareUiState = 'idle' | 'loading' | 'copied' | 'error';

function ShareNodeButton({
  nodeId,
  hasAnyAssets,
  comparableCount,
  accent,
}: {
  nodeId: string;
  hasAnyAssets: boolean;
  comparableCount: number;
  accent: string;
}) {
  const [ui, setUi] = useState<ShareUiState>('idle');
  const isMobile = useMobile();
  const enabled = hasAnyAssets;

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!enabled || ui === 'loading' || ui === 'copied') return;
      setUi('loading');
      try {
        const url = await createHypotheticalShareLink(nodeId);
        if (!url) {
          track('share_link_failed', { stage: 'create', source: 'hypothetical_node' });
          setUi('error');
          setTimeout(() => setUi('idle'), 2000);
          return;
        }
        track('share_link_created', {
          source: 'hypothetical_node',
          comparable_count: comparableCount,
          surface: isMobile ? 'mobile' : 'desktop',
        });
        // Mobile gets the native share sheet; desktop copies to clipboard.
        if (isMobile && typeof navigator !== 'undefined' && navigator.share) {
          try {
            await navigator.share({ url });
            setUi('copied');
          } catch {
            setUi('idle');
            return;
          }
        } else {
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            window.prompt('Copy this link:', url);
          }
          setUi('copied');
        }
        setTimeout(() => setUi('idle'), 2500);
      } catch (err) {
        console.error('[ShareNodeButton] Failed:', err);
        track('share_link_failed', { stage: 'exception', source: 'hypothetical_node' });
        setUi('error');
        setTimeout(() => setUi('idle'), 2000);
      }
    },
    [enabled, ui, nodeId, comparableCount, isMobile],
  );

  const label =
    ui === 'loading' ? 'Sharing…' :
    ui === 'copied' ? 'Copied!' :
    ui === 'error' ? 'Failed' :
    'Share';
  const color = ui === 'copied' ? '#4ecdc4' : ui === 'error' ? '#ff4444' : (enabled ? accent : 'var(--text-muted)');
  const borderColor = ui === 'copied' ? '#4ecdc4' : ui === 'error' ? '#ff4444' : (enabled ? accent : 'var(--border-subtle)');
  const bg = ui === 'copied' ? `#4ecdc41a` : enabled ? `${accent}1a` : 'transparent';

  return (
    <button
      type="button"
      className="nopan nodrag"
      data-share-button
      data-node-id={nodeId}
      disabled={!enabled || ui === 'loading'}
      onClick={handleShare}
      title={
        enabled
          ? 'Copy a shareable link to this proposed trade'
          : 'Add players or picks to share'
      }
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: 3,
        border: `1px solid ${borderColor}`,
        background: bg,
        color,
        cursor: enabled && ui !== 'loading' ? 'pointer' : 'not-allowed',
        transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (enabled && ui === 'idle') e.currentTarget.style.background = `${accent}33`;
      }}
      onMouseLeave={(e) => {
        if (enabled && ui === 'idle') e.currentTarget.style.background = `${accent}1a`;
      }}
    >
      {label}
    </button>
  );
}

export default memo(HypotheticalTradeNodeComponent);
