'use client';

import { memo } from 'react';
import { getStraightPath, type EdgeProps } from '@xyflow/react';
import { useGraphStore } from '@/lib/graph-store';

function HighlightableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const isHighlighted = useGraphStore((s) => s.highlightedEdges.has(id));
  const isFollowHighlighted = useGraphStore((s) => s.followHighlightedEdges.has(id));
  const hasAnyHighlight = useGraphStore((s) => s.highlightedEdges.size > 0 || s.followHighlightedEdges.size > 0);
  const highlightEdgePath = useGraphStore((s) => s.highlightEdgePath);

  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  // Color priority: follow gold > click orange > dimmed > default
  const strokeColor = isFollowHighlighted ? '#f9c74f' : isHighlighted ? '#ff6b35' : hasAnyHighlight ? '#333' : '#555';
  const strokeWidth = isFollowHighlighted ? 2.5 : isHighlighted ? 2.5 : 1.5;
  const opacity = hasAnyHighlight && !isHighlighted && !isFollowHighlighted ? 0.25 : 1;

  return (
    <>
      {/* Wide invisible hit area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onClick={(e) => {
          e.stopPropagation();
          highlightEdgePath(id);
        }}
        style={{ cursor: 'pointer' }}
      />
      {/* Visible edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          opacity,
          transition: 'stroke 0.2s, stroke-width 0.2s, opacity 0.2s',
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

export default memo(HighlightableEdge);
