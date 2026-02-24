'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useGraphStore } from '@/lib/graph-store';
import type { GapNodeData } from '@/lib/graph-store';

function GapNodeComponent({ id, data }: NodeProps) {
  const { fromYear, toYear, durationYears, teamId } = data as GapNodeData;
  const toggleGap = useGraphStore((s) => s.toggleGap);
  const expandedGapIds = useGraphStore((s) => s.expandedGapIds);
  const isExpanded = expandedGapIds.has(id);

  return (
    <div
      className="nopan nodrag"
      onClick={(e) => {
        e.stopPropagation();
        toggleGap(id);
      }}
      style={{
        width: 200,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        padding: '0 8px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px dashed rgba(255,255,255,0.10)',
        fontFamily: 'var(--font-body)',
        transition: 'background 0.15s, border-color 0.15s',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
      }}
      title={isExpanded ? 'Collapse gap to compress timeline' : 'Expand gap to see full timeline spacing'}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Dashes */}
      <span
        style={{
          fontSize: 7,
          color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.15em',
          flexShrink: 0,
        }}
      >
        ╌╌
      </span>

      {/* Label */}
      <span
        style={{
          flex: 1,
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textAlign: 'center',
        }}
      >
        {fromYear}–{toYear} · {durationYears} yrs · {teamId}
      </span>

      {/* Expand/collapse toggle */}
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: isExpanded ? 'var(--accent-teal, #4ecdc4)' : 'rgba(255,255,255,0.30)',
          width: 12,
          textAlign: 'center',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {isExpanded ? '−' : '+'}
      </span>

      {/* Dashes */}
      <span
        style={{
          fontSize: 7,
          color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.15em',
          flexShrink: 0,
        }}
      >
        ╌╌
      </span>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(GapNodeComponent);
