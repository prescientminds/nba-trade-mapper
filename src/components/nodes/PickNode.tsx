'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useGraphStore, PickNodeData } from '@/lib/graph-store';

function PickNodeComponent({ id, data }: NodeProps) {
  const { label, becamePlayer } = data as PickNodeData;
  const expandPickNode = useGraphStore((s) => s.expandPickNode);
  const expandedNodes = useGraphStore((s) => s.expandedNodes);

  const isExpanded = expandedNodes.has(id);
  const hasAction = !!becamePlayer && !isExpanded;

  return (
    <div
      className="pick-card"
      onClick={() => hasAction && expandPickNode(id)}
      style={{
        width: 100,
        minHeight: 26,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-medium)',
        borderLeft: '2px solid var(--pick-yellow)',
        cursor: hasAction ? 'pointer' : 'default',
        transition: 'var(--transition-base)',
        padding: '3px 5px',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={(e) => {
        if (hasAction) {
          e.currentTarget.style.borderColor = 'var(--pick-yellow)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(245,230,163,0.2)';
        }
      }}
      onMouseLeave={(e) => {
        if (hasAction) {
          e.currentTarget.style.borderColor = 'var(--border-medium)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div
        style={{
          fontSize: 8,
          fontWeight: 600,
          color: 'var(--pick-yellow)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {label}
      </div>

      {becamePlayer && (
        <div
          style={{
            fontSize: 8,
            color: 'var(--text-secondary)',
            marginTop: 1,
          }}
        >
          {'\u2192'} <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{becamePlayer}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(PickNodeComponent);
