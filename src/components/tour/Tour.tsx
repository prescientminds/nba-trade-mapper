'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface TourStep {
  target: string | null;
  title: string;
  content: string;
  placement: 'top' | 'bottom';
}

interface Props {
  tourId: string;
  steps: TourStep[];
  welcome?: { title: string; subtitle: string };
  delay?: number;
  onComplete?: () => void;
}

const PREFIX = 'nba-tm-tour-';

function isInViewport(r: DOMRect) {
  return r.top >= -50 && r.bottom <= window.innerHeight + 50;
}

export default function Tour({ tourId, steps, welcome, delay = 600, onComplete }: Props) {
  const storageKey = PREFIX + tourId;
  const [phase, setPhase] = useState<'init' | 'waiting' | 'prompt' | 'touring' | 'done'>('init');
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrolledRef = useRef(false);

  // Check localStorage
  useEffect(() => {
    if (localStorage.getItem(storageKey)) {
      setPhase('done');
    } else {
      const t = setTimeout(() => setPhase('waiting'), delay);
      return () => clearTimeout(t);
    }
  }, [storageKey, delay]);

  // Wait for first target to appear in DOM
  useEffect(() => {
    if (phase !== 'waiting') return;
    const firstTarget = steps[0]?.target;
    if (!firstTarget) {
      setPhase(welcome ? 'prompt' : 'touring');
      return;
    }
    const interval = setInterval(() => {
      if (document.querySelector(`[data-tour="${firstTarget}"]`)) {
        setPhase(welcome ? 'prompt' : 'touring');
      }
    }, 300);
    return () => clearInterval(interval);
  }, [phase, steps, welcome]);

  const complete = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setPhase('done');
    onComplete?.();
  }, [storageKey, onComplete]);

  // Track target position
  useEffect(() => {
    if (phase !== 'touring') return;
    scrolledRef.current = false;
    const target = steps[step]?.target;
    if (!target) { setRect(null); return; }

    const interval = setInterval(() => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (!scrolledRef.current) {
        if (!isInViewport(r)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        scrolledRef.current = true;
      }
      setRect(r);
    }, 80);
    return () => clearInterval(interval);
  }, [phase, step, steps]);

  if (phase === 'done' || phase === 'init' || phase === 'waiting') return null;

  // ── Welcome prompt ────────────────────────────────────────────────
  if (phase === 'prompt' && welcome) {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '32px 28px', maxWidth: 360, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏀</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, color: '#fff',
            letterSpacing: 1.5, marginBottom: 8,
          }}>{welcome.title}</h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginBottom: 24,
          }}>{welcome.subtitle}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={complete} style={{
              flex: 1, padding: '11px 0', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-body)', cursor: 'pointer',
            }}>Skip</button>
            <button onClick={() => setPhase('touring')} style={{
              flex: 1, padding: '11px 0', background: 'var(--accent-orange)',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13,
              fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer',
              letterSpacing: 0.5,
            }}>Take a Tour</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ── Tour step ─────────────────────────────────────────────────────
  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  const W = 320;
  const PAD = 14;
  let pos: React.CSSProperties;

  if (rect) {
    const cx = Math.max(16, Math.min(rect.left + rect.width / 2 - W / 2, window.innerWidth - W - 16));
    pos = current.placement === 'bottom'
      ? { position: 'fixed', top: rect.bottom + PAD, left: cx, width: W }
      : { position: 'fixed', bottom: window.innerHeight - rect.top + PAD, left: cx, width: W };
  } else {
    pos = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: W };
  }

  return createPortal(
    <>
      <div onClick={complete} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />

      {rect ? (
        <div style={{
          position: 'fixed', top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12, borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
          border: '1px solid rgba(255,107,53,0.25)',
          zIndex: 9999, pointerEvents: 'none', transition: 'all 0.35s ease-out',
        }} />
      ) : (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          zIndex: 9999, pointerEvents: 'none',
        }} />
      )}

      <div style={{
        ...pos, zIndex: 10000, background: '#1e1e2a',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
        padding: '16px 20px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 16 : 6, height: 3, borderRadius: 2,
              background: i === step ? 'var(--accent-orange)' : i < step ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.1)',
              transition: 'all 0.3s',
            }} />
          ))}
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'rgba(255,255,255,0.25)',
          }}>{step + 1}/{steps.length}</span>
        </div>

        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 16, color: '#fff',
          letterSpacing: 1, marginBottom: 6,
        }}>{current.title}</h3>

        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,0.6)',
          lineHeight: 1.55, marginBottom: 16,
        }}>{current.content}</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={complete} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: '4px 0',
          }}>Skip tour</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <button onClick={() => setStep(s => s - 1)} style={{
                padding: '7px 14px', background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                color: '#fff', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}>Back</button>
            )}
            <button onClick={() => isLast ? complete() : setStep(s => s + 1)} style={{
              padding: '7px 18px', background: 'var(--accent-orange)', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700,
              fontFamily: 'var(--font-body)', cursor: 'pointer', letterSpacing: 0.3,
            }}>{isLast ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
