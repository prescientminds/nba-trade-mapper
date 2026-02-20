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
      onClick={() => hasAction && expandPickNode(id)}
      style={{
        width: 120,
        minHeight: 32,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-medium)',
        borderLeft: '3px solid var(--accent-gold)',
        cursor: hasAction ? 'pointer' : 'default',
        transition: 'var(--transition-base)',
        padding: '4px 7px',
        fontFamily: 'var(--font-body)',
      }}
      onMouseEnter={(e) => {
        if (hasAction) {
          e.currentTarget.style.borderColor = 'var(--accent-gold)';
          e.currentTarget.style.boxShadow = '0 0 12px rgba(249,199,79,0.2)';
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
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--accent-gold)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {label}
      </div>

      {becamePlayer && (
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-secondary)',
            marginTop: 2,
          }}
        >
          Became: <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>{becamePlayer}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(PickNodeComponent);
