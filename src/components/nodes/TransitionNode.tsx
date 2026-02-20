'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { TEAMS } from '@/lib/teams';
import { useGraphStore } from '@/lib/graph-store';
import type { TransitionNodeData } from '@/lib/graph-store';

const LABELS: Record<string, string> = {
  'free-agency': 'Free Agency',
  drafted: 'Drafted',
  waived: 'Waived',
  unknown: 'Moved',
  traded: 'Traded',
};

function formatTradeDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TransitionNodeComponent({ data }: NodeProps) {
  const { fromTeamId, toTeamId, transitionType, draftYear, draftRound, draftPick, tradeId, tradeDate } = data as TransitionNodeData;
  const openTradeFromTransition = useGraphStore((s) => s.openTradeFromTransition);

  const fromTeam = TEAMS[fromTeamId];
  const toTeam = TEAMS[toTeamId];
  const fromColor = fromTeam?.color || '#666';
  const toColor = toTeam?.color || '#666';
  const label = LABELS[transitionType] || 'Moved';

  const isDraft = transitionType === 'drafted' && draftYear;
  const isTraded = transitionType === 'traded';

  const handleClick = () => {
    if (isTraded && tradeId) {
      openTradeFromTransition(tradeId);
    }
  };

  return (
    <div
      onClick={handleClick}
      style={{
        width: isDraft ? 130 : isTraded ? 120 : 100,
        height: isDraft ? 48 : isTraded ? 44 : 36,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: `1px ${isTraded ? 'solid' : 'dashed'} var(--border-medium)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        fontFamily: 'var(--font-body)',
        opacity: 0.85,
        cursor: isTraded ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (isTraded) {
          e.currentTarget.style.boxShadow = '0 0 12px rgba(255,107,53,0.25)';
          e.currentTarget.style.borderColor = '#ff6b3566';
        }
      }}
      onMouseLeave={(e) => {
        if (isTraded) {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = 'var(--border-medium)';
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {isTraded ? (
        <>
          {tradeDate && (
            <span
              style={{
                fontSize: 7,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}
            >
              {formatTradeDate(tradeDate)}
            </span>
          )}
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: '#ff6b35',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            Traded
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span
              style={{
                fontSize: 7,
                fontWeight: 600,
                padding: '1px 3px',
                borderRadius: 999,
                background: fromColor + '22',
                color: fromColor,
                border: `1px solid ${fromColor}44`,
              }}
            >
              {fromTeamId}
            </span>
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{'\u2192'}</span>
            <span
              style={{
                fontSize: 7,
                fontWeight: 600,
                padding: '1px 3px',
                borderRadius: 999,
                background: toColor + '22',
                color: toColor,
                border: `1px solid ${toColor}44`,
              }}
            >
              {toTeamId}
            </span>
          </div>
        </>
      ) : isDraft ? (
        <>
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {`${draftYear} Draft`}
          </span>
          <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-primary)' }}>
            Rd {draftRound}, Pick #{draftPick}
          </span>
          <span
            style={{
              fontSize: 7,
              fontWeight: 600,
              padding: '1px 3px',
              borderRadius: 999,
              background: toColor + '22',
              color: toColor,
              border: `1px solid ${toColor}44`,
            }}
          >
            {toTeamId}
          </span>
        </>
      ) : (
        <>
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span
              style={{
                fontSize: 7,
                fontWeight: 600,
                padding: '1px 3px',
                borderRadius: 999,
                background: fromColor + '22',
                color: fromColor,
                border: `1px solid ${fromColor}44`,
              }}
            >
              {fromTeamId}
            </span>
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{'\u2192'}</span>
            <span
              style={{
                fontSize: 7,
                fontWeight: 600,
                padding: '1px 3px',
                borderRadius: 999,
                background: toColor + '22',
                color: toColor,
                border: `1px solid ${toColor}44`,
              }}
            >
              {toTeamId}
            </span>
          </div>
        </>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(TransitionNodeComponent);
