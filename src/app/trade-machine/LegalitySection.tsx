// ── Legality banner ───────────────────────────────────────────────
// Renders the legal / illegal / incomplete verdict from evaluateLegality.
// Shared between the standalone /trade-machine page and the canvas-native
// side panel. `sticky` pins it to the top of the scroll container.

import {
  type BuilderState,
  type OwnedPick,
  evaluateLegality,
} from '@/lib/trade-builder';

export default function LegalitySection({
  left,
  right,
  ownership,
  sticky = false,
}: {
  left: BuilderState;
  right: BuilderState;
  ownership: Record<string, OwnedPick[]> | null;
  sticky?: boolean;
}) {
  const verdict = evaluateLegality(left, right, ownership);

  let bg = 'rgba(255, 255, 255, 0.04)';
  let border = 'var(--border-subtle)';
  let color = 'var(--text-tertiary)';
  let label = 'Incomplete';
  if (verdict.status === 'legal') {
    bg = 'rgba(6, 214, 160, 0.12)';
    border = 'rgba(6, 214, 160, 0.35)';
    color = 'var(--accent-green)';
    label = 'Legal';
  } else if (verdict.status === 'illegal') {
    bg = 'rgba(239, 71, 111, 0.16)';
    border = 'rgba(239, 71, 111, 0.5)';
    color = 'var(--accent-red)';
    label = 'Illegal';
  }

  return (
    <section
      style={{
        marginTop: 16,
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        ...(sticky
          ? {
              position: 'sticky',
              top: 12,
              zIndex: 5,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }
          : {}),
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color,
          flexShrink: 0,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {verdict.reason}
      </div>
    </section>
  );
}
