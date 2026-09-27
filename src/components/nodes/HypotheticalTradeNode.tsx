'use client';

import { memo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useGraphStore, HypotheticalTradeNodeData } from '@/lib/graph-store';
import { createHypotheticalShareLink } from '@/lib/share';
import { encodeSides } from '@/lib/hypothetical-sides';
import HypotheticalShareSheet from '@/components/HypotheticalShareSheet';
import TradeCard, { DRAFT_ACCENT } from '@/components/TradeCard';

/**
 * Canvas node for a proposed trade. Editing happens on the full-page
 * builder: clicking the card opens /trade-machine with this node's trade
 * loaded, and "View on canvas" there writes the edits back to this node.
 */
function HypotheticalTradeNodeComponent({ id, data }: NodeProps) {
  const { teamIds, teamColors, sides, assetCounts, verdict } = data as HypotheticalTradeNodeData;
  const cardRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const removeNode = useGraphStore((s) => s.removeNode);
  const visualizeHypothetical = useGraphStore((s) => s.visualizeHypothetical);
  const comparableCount = useGraphStore(
    (s) => s.latestComparablesByNodeId.get(id)?.length ?? 0,
  );

  const [hovered, setHovered] = useState(false);
  const primaryColor = teamColors[0] || DRAFT_ACCENT;
  const hasAnyAssets = assetCounts.players > 0 || assetCounts.picks > 0;

  const openBuilder = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/trade-machine?node=${encodeURIComponent(id)}&t=${encodeSides(sides ?? [])}`);
  };

  return (
    <TradeCard
      cardRef={cardRef}
      teamIds={teamIds}
      teamColors={teamColors}
      sides={sides}
      verdict={verdict}
      borderColor={hovered ? primaryColor + '88' : 'var(--border-medium)'}
      glow={hovered ? `0 0 22px ${primaryColor}33` : undefined}
      onClick={openBuilder}
      onClose={() => removeNode(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <VisualizeButton
              nodeId={id}
              comparableCount={comparableCount}
              accent={primaryColor}
              onVisualize={() => visualizeHypothetical(id)}
            />
            <HypotheticalShareSheet
              fileStem={id}
              cardRef={cardRef}
              enabled={hasAnyAssets}
              comparableCount={comparableCount}
              accent={primaryColor}
              createLink={() => createHypotheticalShareLink(id)}
              source="hypothetical_node"
            />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
            click to edit
          </span>
        </div>
      }
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </TradeCard>
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

export default memo(HypotheticalTradeNodeComponent);
