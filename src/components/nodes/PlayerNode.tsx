'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getAnyTeam } from '@/lib/teams';
import { useGraphStore, PlayerNodeData } from '@/lib/graph-store';
import { useHints } from '@/lib/use-hints';

function PlayerNodeComponent({ id, data }: NodeProps) {
  const { name, teamId, draftYear, draftRound, draftPick } = data as PlayerNodeData;
  const expandPlayerNode = useGraphStore((s) => s.expandPlayerNode);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);
  const loadingNodes = useGraphStore((s) => s.loadingNodes);

  const isExpanded = expandedNodes.has(id);
  const isLoading = loadingNodes.has(id);
  const team = teamId ? getAnyTeam(teamId) : null;
  const color = team?.color || '#4ecdc4';

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      onClick={() => { if (!isExpanded && !isLoading) { useHints.getState().dismiss(2); expandPlayerNode(id); } }}
      style={{
        width: 110,
        background: color + '11',
        borderRadius: 999,
        border: `2px solid ${isExpanded ? color : color + '55'}`,
        cursor: isExpanded ? 'default' : 'pointer',
        transition: 'var(--transition-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 8px',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.borderColor = color;
          e.currentTarget.style.boxShadow = `0 0 16px ${color}33`;
        }
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.borderColor = color + '55';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Avatar circle */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: color + '33',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontWeight: 700,
            color: color,
            flexShrink: 0,
          }}
        >
          {isLoading ? (
            <div
              style={{
                width: 12,
                height: 12,
                border: `2px solid ${color}44`,
                borderTopColor: color,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          ) : (
            initials
          )}
        </div>

        {/* Name */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      </div>

      {/* Draft info */}
      {draftYear && (
        <div
          style={{
            fontSize: 7,
            color: 'var(--text-muted)',
            marginTop: 1,
            letterSpacing: '0.03em',
          }}
        >
          {draftYear} Draft {'\u00B7'} R{draftRound} Pick #{draftPick}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(PlayerNodeComponent);
