'use client';

/**
 * Phase B Step 2a — side panel scaffolding.
 *
 * Docked-right editor shell for the canvas-native Trade Machine. Binds to
 * the store's `hypotheticalWritingNodeId`: renders the panel when a
 * hypothetical-trade node is the active write target, nothing otherwise.
 *
 * Step 2b ports TeamColumn + SalaryLedger + LegalitySection into the body.
 * Step 2c adds comparables cards. For now the body is an intentional
 * placeholder so the binding, layout, and mobile collapse can be verified.
 */

import { useState } from 'react';
import { useMobile } from '@/lib/use-mobile';
import { useGraphStore, HypotheticalTradeNodeData } from '@/lib/graph-store';
import { getAnyTeamDisplayInfo } from '@/lib/teams';

const ACCENT = '#ff6b35';

export default function TradeMachineSidePanel() {
  const writingNodeId = useGraphStore((s) => s.hypotheticalWritingNodeId);
  const node = useGraphStore((s) =>
    s.nodes.find((n) => n.id === s.hypotheticalWritingNodeId),
  );
  const setWritingNode = useGraphStore((s) => s.setHypotheticalWritingNode);
  const isMobile = useMobile();
  const [collapsed, setCollapsed] = useState(false);

  if (!writingNodeId || !node || node.type !== 'hypotheticalTrade') return null;

  const { teamIds, teamColors } = node.data as HypotheticalTradeNodeData;
  const primaryColor = teamColors[0] || ACCENT;

  const shellMobile: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: collapsed ? 'auto' : '70vh',
    borderTop: `2px solid ${primaryColor}`,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  };
  const shellDesktop: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 420,
    borderLeft: `2px solid ${primaryColor}`,
  };

  return (
    <div
      data-trade-machine-panel
      style={{
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(14, 14, 20, 0.97)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 0 40px rgba(0,0,0,0.55)',
        fontFamily: 'var(--font-body)',
        ...(isMobile ? shellMobile : shellDesktop),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#0a0a0f',
            background: primaryColor,
            padding: '3px 7px',
            borderRadius: 3,
            lineHeight: 1,
          }}
        >
          DRAFT
        </span>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {teamIds.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No teams yet</span>
          ) : (
            teamIds.map((tid, i) => (
              <span
                key={tid}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 12,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  color: 'var(--text-primary)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: `1px solid ${(teamColors[i] || ACCENT)}55`,
                  background: `${(teamColors[i] || ACCENT)}1a`,
                }}
              >
                {getAnyTeamDisplayInfo(tid)?.name.split(' ').pop() || tid}
              </span>
            ))
          )}
        </div>

        {isMobile && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            style={{
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {collapsed ? '▲' : '▼'}
          </button>
        )}

        <button
          onClick={() => setWritingNode(null)}
          aria-label="Close trade editor"
          style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          ✕
        </button>
      </div>

      {/* Body — Step 2b/2c port target */}
      {!(isMobile && collapsed) && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 8,
            color: 'var(--text-muted)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            Trade editor
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 280, margin: 0 }}>
            Roster picker, salary ledger, and legality check land here in Step 2b.
            Comparables follow in 2c.
          </p>
        </div>
      )}
    </div>
  );
}
