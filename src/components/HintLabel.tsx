'use client';

/**
 * A subtle inline hint label — small text with a pulsing dot.
 * Renders as a watermark that fades naturally into the UI.
 */
export function HintLabel({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        ...style,
      }}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: 'var(--accent-orange)',
          animation: 'hintPulse 2s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          fontWeight: 400,
          letterSpacing: 0.2,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}
