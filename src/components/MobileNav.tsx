'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '@/lib/graph-store';

type Direction = 'up' | 'down' | 'left' | 'right';

export default function MobileNav() {
  const nodes = useGraphStore((s) => s.nodes);
  const setPendingFitTarget = useGraphStore((s) => s.setPendingFitTarget);
  const { screenToFlowPosition } = useReactFlow();

  const navigate = useCallback(
    (dir: Direction) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const threshold = 20;

      const candidates = nodes.filter((n) => {
        const nx = (n.position.x ?? 0) + ((n.measured?.width ?? 200) / 2);
        const ny = (n.position.y ?? 0) + ((n.measured?.height ?? 80) / 2);

        switch (dir) {
          case 'up':    return ny < center.y - threshold;
          case 'down':  return ny > center.y + threshold;
          case 'left':  return nx < center.x - threshold;
          case 'right': return nx > center.x + threshold;
        }
      });

      if (candidates.length === 0) return;

      // Score by weighted distance — prefer nodes along the primary axis
      let best = candidates[0];
      let bestScore = Infinity;

      for (const n of candidates) {
        const nx = (n.position.x ?? 0) + ((n.measured?.width ?? 200) / 2);
        const ny = (n.position.y ?? 0) + ((n.measured?.height ?? 80) / 2);
        const dx = Math.abs(nx - center.x);
        const dy = Math.abs(ny - center.y);

        let score: number;
        if (dir === 'up' || dir === 'down') {
          score = dy + dx * 2; // primary = vertical, penalize horizontal offset
        } else {
          score = dx + dy * 2; // primary = horizontal, penalize vertical offset
        }

        if (score < bestScore) {
          bestScore = score;
          best = n;
        }
      }

      setPendingFitTarget(best.id);
    },
    [nodes, screenToFlowPosition, setPendingFitTarget],
  );

  if (nodes.length === 0) return null;

  const btnStyle: React.CSSProperties = {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontSize: 18,
    padding: 0,
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 76,
        right: 16,
        zIndex: 9,
        display: 'grid',
        gridTemplateColumns: '44px 44px 44px',
        gridTemplateRows: '44px 44px 44px',
        gap: 2,
        background: 'rgba(18,18,26,0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 4,
      }}
    >
      {/* Row 1: up in center */}
      <div />
      <button className="dpad-btn" style={btnStyle} onClick={() => navigate('up')} aria-label="Navigate up">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <div />

      {/* Row 2: left, center dot, right */}
      <button className="dpad-btn" style={btnStyle} onClick={() => navigate('left')} aria-label="Navigate left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div style={{ ...btnStyle, background: 'transparent', border: 'none', cursor: 'default' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
      </div>
      <button className="dpad-btn" style={btnStyle} onClick={() => navigate('right')} aria-label="Navigate right">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Row 3: down in center */}
      <div />
      <button className="dpad-btn" style={btnStyle} onClick={() => navigate('down')} aria-label="Navigate down">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div />
    </div>
  );
}
