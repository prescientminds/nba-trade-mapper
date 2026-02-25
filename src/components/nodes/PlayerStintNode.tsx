'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getTeamDisplayInfo } from '@/lib/teams';
import { useGraphStore, PlayerStintNodeData } from '@/lib/graph-store';
import { SeasonTable } from '@/components/SeasonTable';
import { ensureReadable } from '@/lib/colors';

function PlayerStintNodeComponent({ id, data }: NodeProps) {
  const {
    playerName,
    teamId,
    seasons,
    avgPpg,
    avgRpg,
    avgApg,
    totalWinShares,
    accolades,
    seasonDetails,
    draftYear,
    draftRound,
    draftPick,
    playoffWs,
    canExpandBackward,
  } = data as PlayerStintNodeData;

  const expandStintDetails = useGraphStore((s) => s.expandStintDetails);
  const removeNode = useGraphStore((s) => s.removeNode);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const loadingNodes = useGraphStore((s) => s.loadingNodes);
  const coreNodes = useGraphStore((s) => s.coreNodes);
  const expandChampionshipPlayer = useGraphStore((s) => s.expandChampionshipPlayer);

  const isExpanded = expandedNodes.has(id);
  const isLoading = loadingNodes.has(id);
  const isCore = coreNodes.has(id);

  // Derive approximate date from first season for historical team name lookup
  const stintDate = seasons.length > 0 ? `${seasons[0].split('-')[0]}-10-01` : undefined;
  const teamInfo = getTeamDisplayInfo(teamId, stintDate);
  const color = ensureReadable(teamInfo.color || '#9b5de5');

  const yearRange =
    seasons.length === 1
      ? seasons[0]
      : `${seasons[0]} to ${seasons[seasons.length - 1]}`;

  // Draft info for first stint (not a trade — rendered as subtle header)
  const draftLabel = draftYear
    ? `${draftYear} Draft \u00B7 R${draftRound} Pick #${draftPick}`
    : null;

  // Accolade icons (collapsed only)
  const hasAllStar = accolades.some((a) => a === 'All-Star');
  const hasChampion = accolades.some((a) => a.includes('Champion'));
  const hasMVP = accolades.some((a) => a === 'MVP');
  const hasAllNBA = accolades.some((a) => a.includes('All-NBA'));
  const hasAnyAccolade = hasAllStar || hasChampion || hasMVP || hasAllNBA;

  return (
    <div
      style={{
        width: isExpanded ? 230 : 180,
        overflow: canExpandBackward ? 'visible' : 'hidden',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isExpanded ? color + '66' : 'var(--border-medium)'}`,
        borderLeft: `2px solid ${color}`,
        transition: 'width 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
        boxShadow: isExpanded
          ? `0 0 16px ${color}22`
          : '0 2px 8px rgba(0,0,0,0.3)',
        padding: isExpanded ? '4px 8px' : '3px 6px',
        fontFamily: 'var(--font-body)',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.boxShadow = `0 0 16px ${color}33`;
          e.currentTarget.style.borderColor = color + '88';
        }
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
          e.currentTarget.style.borderColor = 'var(--border-medium)';
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Backward expand button — championship mode */}
      {canExpandBackward && (
        <div
          className="nopan nodrag"
          onClick={(e) => { e.stopPropagation(); expandChampionshipPlayer(playerName); }}
          style={{
            position: 'absolute',
            top: -18,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 20,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px 4px 0 0',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-medium)',
            borderBottom: 'none',
            color: 'var(--text-secondary)',
            fontSize: 11,
            lineHeight: 1,
            cursor: 'pointer',
            zIndex: 2,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          title="Expand history"
        >
          +
        </div>
      )}

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
          {'\u2715'}
        </div>
      )}

      {/* Player name header */}
      {playerName && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playerName}
        </div>
      )}

      {/* Draft info header (only on first stint for drafted players) */}
      {draftLabel && (
        <div
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.03em',
            marginBottom: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {draftLabel}
        </div>
      )}

      {/* Main line: team badge + year range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 999,
            background: color + '22',
            color: color,
            border: `1px solid ${color}44`,
            flexShrink: 0,
          }}
        >
          {teamInfo.abbreviation}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-secondary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {yearRange}
        </span>
        {/* Accolade dots (collapsed only) */}
        {!isExpanded && hasAnyAccolade && (
          <span style={{ display: 'inline-flex', gap: 1, flexShrink: 0 }}>
            {hasMVP && <span title="MVP" style={{ fontSize: 7 }}>{'\uD83D\uDC51'}</span>}
            {hasChampion && <span title="Champion" style={{ fontSize: 7 }}>{'\uD83C\uDFC6'}</span>}
            {hasAllStar && <span title="All-Star" style={{ fontSize: 7 }}>{'\u2B50'}</span>}
            {hasAllNBA && <span title="All-NBA" style={{ fontSize: 7 }}>{'\uD83C\uDFC5'}</span>}
          </span>
        )}
      </div>

      {/* Stats summary — always visible below the heading */}
      {avgPpg !== null && (
        <div style={{
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          marginTop: 1,
        }}>
          {avgPpg.toFixed(1)}/{avgRpg?.toFixed(1) ?? '--'}/{avgApg?.toFixed(1) ?? '--'}
          <span style={{ fontSize: 7, color: 'var(--text-muted)', marginLeft: 3 }}>PPG/RPG/APG</span>
          {totalWinShares !== null && (
            <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 6 }}>
              WS: {totalWinShares.toFixed(1)}
            </span>
          )}
        </div>
      )}

      {/* Playoff Win Shares — shown in championship mode */}
      {playoffWs != null && (
        <div style={{
          fontSize: 8,
          fontFamily: 'var(--font-mono)',
          color: '#f9c74f',
          marginTop: 1,
        }}>
          Playoff WS: {playoffWs.toFixed(1)}
        </div>
      )}

      {/* Expand/Collapse stats button — distinct clickable bar */}
      <div
        className="nopan nodrag"
        onClick={(e) => {
          e.stopPropagation();
          if (!isLoading) expandStintDetails(id);
        }}
        style={{
          marginTop: 2,
          padding: '1px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          cursor: 'pointer',
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          transition: 'background 0.15s',
          borderRadius: '0 0 4px 4px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        title={isExpanded ? 'Collapse season details' : 'Expand season details'}
      >
        <span style={{ fontSize: 7, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.05em' }}>
          {isExpanded ? 'Hide' : 'Seasons'}
        </span>
        <span
          style={{
            fontSize: 8,
            color: 'var(--text-muted)',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            lineHeight: 1,
          }}
        >
          {'\u25BE'}
        </span>
      </div>

      {/* Expanded: season table */}
      {isExpanded && (
        <div style={{ marginTop: 2 }}>
          {seasonDetails && seasonDetails.length > 0 && (
            <SeasonTable rows={seasonDetails} />
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 12,
            height: 12,
            border: `2px solid ${color}44`,
            borderTopColor: color,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(PlayerStintNodeComponent);
