'use client';

import { memo, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getAnyTeamDisplayInfo } from '@/lib/teams';
import { useGraphStore, HypotheticalTradeNodeData } from '@/lib/graph-store';

const DRAFT_ACCENT = '#ff6b35';

function HypotheticalTradeNodeComponent({ id, data }: NodeProps) {
  const { teamIds, teamColors, assetCounts, isWriting } = data as HypotheticalTradeNodeData;
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const removeNode = useGraphStore((s) => s.removeNode);

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
    if (teamIds.length === 1) {
      const n1 = getAnyTeamDisplayInfo(teamIds[0])?.name.split(' ').pop() || teamIds[0];
      return `${n1} & ?`;
    }
    if (teamIds.length === 2) {
      const n1 = getAnyTeamDisplayInfo(teamIds[0])?.name.split(' ').pop() || teamIds[0];
      const n2 = getAnyTeamDisplayInfo(teamIds[1])?.name.split(' ').pop() || teamIds[1];
      return `${n1} & ${n2}`;
    }
    return `${teamIds.length}-Team Trade`;
  }, [teamIds]);

  const assetSummary = useMemo(() => {
    const parts: string[] = [];
    if (assetCounts.players > 0) parts.push(`${assetCounts.players}P`);
    if (assetCounts.picks > 0) parts.push(`${assetCounts.picks}Pk`);
    return parts.length > 0 ? parts.join(' ') : 'empty';
  }, [assetCounts]);

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
        width: 180,
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

      {/* Subtitle: asset count + edit hint */}
      <div
        style={{
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-muted)',
            letterSpacing: '0.3px',
          }}
        >
          {assetSummary}
        </span>
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

export default memo(HypotheticalTradeNodeComponent);
