'use client';

/**
 * The proposed-trade card: heading, LEGAL/ILLEGAL verdict, and what each
 * team receives. One component so the canvas node, the builder page's
 * preview, and the shared PNG are the same picture.
 *
 * Capture markers (read by HypotheticalShareSheet): `data-capture-hide`
 * elements (buttons, close ✕) are dropped from the image and
 * `data-capture-only` elements (the site watermark) appear only in it.
 */

import { useMemo, type ReactNode, type RefObject } from 'react';
import type { HypotheticalSide } from '@/lib/graph-store';
import type { LegalityVerdict } from '@/lib/trade-builder';
import { computeLedgerRows, pickLabel, teamShortName } from '@/lib/hypothetical-sides';

export const DRAFT_ACCENT = '#ff6b35';

export function tradeHeading(teamIds: string[]): string {
  if (teamIds.length === 0) return 'New Trade';
  const names = teamIds.map(teamShortName);
  if (names.length === 1) return `${names[0]} & ?`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function TradeCard({
  teamIds,
  teamColors,
  sides,
  verdict,
  cardRef,
  width = 220,
  borderColor = 'var(--border-medium)',
  glow,
  onClick,
  onClose,
  footer,
  children,
  ...rest
}: {
  teamIds: string[];
  teamColors: string[];
  sides: HypotheticalSide[] | undefined;
  verdict?: LegalityVerdict;
  cardRef?: RefObject<HTMLDivElement | null>;
  width?: number;
  borderColor?: string;
  glow?: string;
  onClick?: (e: React.MouseEvent) => void;
  onClose?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const primaryColor = teamColors[0] || DRAFT_ACCENT;
  const ledgerRows = useMemo(() => computeLedgerRows(sides), [sides]);
  const hasAnyAssets = ledgerRows.some((r) => r.players.length > 0 || r.picks.length > 0);

  return (
    <div
      ref={cardRef}
      data-trade-card
      className="hypothetical-trade-card"
      onClick={onClick}
      {...rest}
      style={{
        width,
        minHeight: 44,
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        borderStyle: 'dashed',
        borderTopColor: primaryColor,
        borderRightColor: borderColor,
        borderBottomColor: borderColor,
        borderLeftColor: borderColor,
        borderTopWidth: '2px',
        borderRightWidth: '1.5px',
        borderBottomWidth: '1.5px',
        borderLeftWidth: '1.5px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'var(--transition-base)',
        boxShadow: glow ?? '0 2px 12px rgba(0,0,0,0.3)',
        padding: '4px 6px',
        fontFamily: 'var(--font-body)',
        position: 'relative',
      }}
    >
      {children}

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

      {onClose && (
        <div
          className="nopan nodrag"
          data-capture-hide
          onClick={(e) => { e.stopPropagation(); onClose(); }}
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
        >
          ✕
        </div>
      )}

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
        {tradeHeading(teamIds)}
      </div>

      {hasAnyAssets && verdict && <VerdictRow status={verdict.status} reason={verdict.reason} />}

      {ledgerRows.length > 0 && hasAnyAssets && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ledgerRows.map((row) => {
            const isEmpty = row.players.length === 0 && row.picks.length === 0;
            return (
              <div key={row.teamId} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    lineHeight: 1.2,
                  }}
                >
                  {row.teamName} receives
                </div>
                {isEmpty ? (
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: 6, lineHeight: 1.3 }}>
                    nothing yet
                  </div>
                ) : (
                  <>
                    {row.players.map((name) => (
                      <div
                        key={`p-${name}`}
                        title={name}
                        style={{
                          fontSize: 10,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3,
                          paddingLeft: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        • {name}
                      </div>
                    ))}
                    {row.picks.map((pick) => (
                      <div
                        key={`pk-${pick.pick_key}`}
                        title={pickLabel(pick)}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.3,
                          paddingLeft: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        • {pickLabel(pick)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {footer && (
        <div data-capture-hide style={{ marginTop: 4 }}>
          {footer}
        </div>
      )}

      <div
        data-capture-only
        style={{
          display: 'none',
          marginTop: 6,
          paddingTop: 4,
          borderTop: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          letterSpacing: '0.5px',
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}
      >
        nbatrademapper.com
      </div>
    </div>
  );
}

const VERDICT_STYLE = {
  legal: { label: 'LEGAL', color: 'var(--accent-green)', bg: 'rgba(6, 214, 160, 0.14)', border: 'rgba(6, 214, 160, 0.4)' },
  illegal: { label: 'ILLEGAL', color: 'var(--accent-red)', bg: 'rgba(239, 71, 111, 0.16)', border: 'rgba(239, 71, 111, 0.5)' },
  incomplete: { label: 'INCOMPLETE', color: 'var(--text-tertiary)', bg: 'rgba(255, 255, 255, 0.04)', border: 'var(--border-subtle)' },
} as const;

export function verdictStyle(status: LegalityVerdict['status']) {
  return VERDICT_STYLE[status];
}

function VerdictRow({ status, reason }: LegalityVerdict) {
  const v = VERDICT_STYLE[status];
  return (
    <div
      data-verdict={status}
      style={{
        marginTop: 5,
        padding: '4px 6px',
        borderRadius: 4,
        background: v.bg,
        border: `1px solid ${v.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', color: v.color, lineHeight: 1 }}>
        {v.label}
      </span>
      <span style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{reason}</span>
    </div>
  );
}
