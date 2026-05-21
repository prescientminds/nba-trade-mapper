'use client';

/**
 * Phase B redirection item 6 — comparable-to edge.
 *
 * Dashed green stroke connecting a hypothetical trade to each of its top-5
 * historical comparables (spawned as real TradeNodes by visualizeHypothetical).
 * Visual language: dashed = derived/non-canonical (matches the hypothetical
 * node's dashed border), green = match. No click behavior — these edges are
 * decorative and don't participate in the highlightable/follow-path systems.
 */

import { memo } from 'react';
import { getStraightPath, type EdgeProps } from '@xyflow/react';

const STROKE = '#4ecdc4';

function ComparableToEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <path
      d={edgePath}
      fill="none"
      stroke={STROKE}
      strokeWidth={1.5}
      strokeDasharray="6 4"
      opacity={0.75}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default memo(ComparableToEdge);
