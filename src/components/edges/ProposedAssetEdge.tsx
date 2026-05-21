'use client';

/**
 * Phase B redirection item 6c — proposed-asset edge.
 *
 * Solid orange stroke connecting a hypothetical trade to each PlayerNode
 * spawned by visualizeHypothetical for the players being moved in the
 * trade. Visual language: solid (not dashed) because the player IS part
 * of the hypothetical (not a derived match like a comparable trade);
 * accent-orange matches the DRAFT badge so the player-fan reads as the
 * hypothetical's own assets vs the dashed teal-green comparableTo fan.
 *
 * No click behavior — these edges are decorative and don't participate
 * in the highlightable/follow-path systems.
 */

import { memo } from 'react';
import { getStraightPath, type EdgeProps } from '@xyflow/react';

const STROKE = '#ff6b35';

function ProposedAssetEdge({
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
      opacity={0.7}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default memo(ProposedAssetEdge);
