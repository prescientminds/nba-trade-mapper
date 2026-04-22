'use client';

import { useEffect } from 'react';

const TIERS: Array<{ label: string; range: string; color: string }> = [
  { label: 'All-time great',    range: '+10 or higher', color: '#f9c74f' },
  { label: 'MVP-caliber',       range: '+5 to +10',     color: '#6ee0d8' },
  { label: 'Above average',     range: '+2 to +5',      color: '#a8d5ff' },
  { label: 'League average',    range: '0',             color: 'var(--text-secondary)' },
  { label: 'Bench / rotation',  range: '-2 to 0',       color: '#d88a88' },
  { label: 'Replacement level', range: 'below -2',      color: '#b05656' },
];

export default function BPMExplainer({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: '100%',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          fontFamily: 'var(--font-body)',
          color: 'var(--text-primary)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 10,
            right: 14,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            letterSpacing: '0.03em',
            margin: 0,
            marginBottom: 4,
          }}
        >
          Box Plus/Minus (BPM)
        </h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Per-100-possession impact above league average
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)', marginTop: 0 }}>
          BPM estimates how many points per 100 possessions a player contributes above an average
          player, accounting for the quality of their teammates and opponents. It&rsquo;s derived
          from a regression against per-minute box-score production — points, rebounds, assists,
          steals, blocks, turnovers — adjusted for pace and position.
        </p>

        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Used here because it reacts faster than Win Shares. BPM picks up a sophomore leap from
          −2 to +4 after eighteen games; WS needs a full season to register the same signal.
          That makes it the right input for comparing players over short periods, catching
          young players about to pop, and matching proposed trades against historical analogs.
        </p>

        <div style={{ marginTop: 18, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Scale
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TIERS.map((t) => (
            <div
              key={t.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: 12,
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', color: t.color, fontWeight: 600 }}>
                {t.range}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{t.label}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Values pulled from Basketball Reference (BBRef).
          <a
            href="https://www.basketball-reference.com/about/bpm2.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-orange)', marginLeft: 8 }}
          >
            Read BBRef&rsquo;s methodology →
          </a>
        </div>
      </div>
    </div>
  );
}
