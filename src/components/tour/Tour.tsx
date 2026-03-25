'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTourStore } from '@/lib/tour-store';

function isInViewport(r: DOMRect) {
  return r.top >= -50 && r.bottom <= window.innerHeight + 50;
}

/**
 * Single guided tour component — reads from the global tour store.
 * Mount once at the app root. Supports passive (Next/Back) and
 * interactive (waitFor) steps.
 *
 * Interactive steps: overlay is purely visual (pointer-events: none).
 * Clicks pass through to the actual elements underneath.
 *
 * Passive steps: a full-screen click guard absorbs clicks (skip on click).
 */
export default function GuidedTour() {
  const activeTour = useTourStore((s) => s.activeTour);
  const steps = useTourStore((s) => s.steps);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const showingWelcome = useTourStore((s) => s.showingWelcome);
  const revealing = useTourStore((s) => s.revealing);
  const acceptWelcome = useTourStore((s) => s.acceptWelcome);
  const next = useTourStore((s) => s.next);
  const back = useTourStore((s) => s.back);
  const skip = useTourStore((s) => s.skip);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const scrolledRef = useRef(false);

  // Track target element position
  useEffect(() => {
    if (!activeTour || showingWelcome || revealing) { setRect(null); return; }
    const current = steps[stepIndex];
    if (!current?.target) { setRect(null); return; }
    scrolledRef.current = false;

    const interval = setInterval(() => {
      const el = document.querySelector(`[data-tour="${current.target}"]`);
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
  }, [activeTour, stepIndex, showingWelcome, revealing, steps]);

  if (!activeTour) return null;

  // Reveal phase — overlay hidden so user sees the result of their action
  if (revealing) return null;

  const current = steps[stepIndex];
  if (!current) return null;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const isInteractive = !!current.waitFor;

  // ── Welcome prompt ──────────────────────────────────────────────────
  if (showingWelcome) {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}>
        <div style={{
          background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, padding: '32px 28px', maxWidth: 360, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏀</div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 22, color: '#fff',
            letterSpacing: 1.5, marginBottom: 8,
          }}>NBA TRADE MAPPER</h2>
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, marginBottom: 24,
          }}>Every NBA and WNBA trade since 1976, mapped as a visual graph. Want a quick tour?</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={skip} style={{
              flex: 1, padding: '11px 0', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
              color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-body)', cursor: 'pointer',
            }}>Skip</button>
            <button onClick={acceptWelcome} style={{
              flex: 1, padding: '11px 0', background: 'var(--accent-orange)',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13,
              fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer',
              letterSpacing: 0.5,
            }}>Take the Tour</button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ── Tooltip position ────────────────────────────────────────────────
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const isMobile = vw < 480;
  const W = isMobile ? vw - 24 : Math.min(320, vw - 32);
  const PAD = 14;
  let pos: React.CSSProperties;

  if (isMobile) {
    // Pin to bottom on mobile — always visible regardless of target position
    pos = { position: 'fixed', bottom: 12, left: 12, right: 12, width: 'auto' };
  } else if (rect) {
    const cx = Math.max(16, Math.min(rect.left + rect.width / 2 - W / 2, vw - W - 16));
    if (current.placement === 'bottom') {
      const top = rect.bottom + PAD;
      if (top + 180 > window.innerHeight) {
        pos = { position: 'fixed', bottom: window.innerHeight - rect.top + PAD, left: cx, width: W };
      } else {
        pos = { position: 'fixed', top, left: cx, width: W };
      }
    } else {
      const bottom = window.innerHeight - rect.top + PAD;
      if (bottom + 180 > window.innerHeight) {
        pos = { position: 'fixed', top: rect.bottom + PAD, left: cx, width: W };
      } else {
        pos = { position: 'fixed', bottom, left: cx, width: W };
      }
    }
  } else {
    pos = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: W };
  }

  // ── Render ──────────────────────────────────────────────────────────
  //
  // Interactive steps: entire overlay is pointer-events:none so clicks
  // pass through to the underlying React Flow nodes. Only the tooltip
  // captures pointer events (for Skip/Back buttons).
  //
  // Passive steps: a full-screen click guard absorbs clicks (skip tour).

  return createPortal(
    <>
      {/* No click guard — users skip via the explicit "Skip tour" button.
          This lets clicks pass through to React Flow nodes on all steps. */}

      {/* Spotlight overlay with gold halo — always pointer-events:none */}
      {rect ? (
        <div className="tour-spotlight" style={{
          position: 'fixed', top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12, borderRadius: 10,
          zIndex: 9999, pointerEvents: 'none',
          transition: 'top 0.35s ease-out, left 0.35s ease-out, width 0.35s ease-out, height 0.35s ease-out',
        }} />
      ) : (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 9999, pointerEvents: 'none',
        }} />
      )}

      {/* Tooltip */}
      <div style={{
        ...pos, zIndex: 10000, background: '#1e1e2a',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
        padding: '16px 20px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 10 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === stepIndex ? 16 : 6, height: 3, borderRadius: 2,
              background: i === stepIndex ? 'var(--accent-orange)' : i < stepIndex ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.1)',
              transition: 'all 0.3s',
            }} />
          ))}
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'rgba(255,255,255,0.25)',
          }}>{stepIndex + 1}/{steps.length}</span>
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
          <button onClick={skip} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', padding: '4px 0',
          }}>Skip tour</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isFirst && (
              <button onClick={back} style={{
                padding: '7px 14px', background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                color: '#fff', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}>Back</button>
            )}
            {isInteractive ? (
              <div style={{
                padding: '7px 18px', background: 'rgba(255,107,53,0.15)',
                border: '1px solid rgba(255,107,53,0.3)', borderRadius: 6,
                color: 'var(--accent-orange)', fontSize: 11, fontWeight: 700,
                fontFamily: 'var(--font-body)', letterSpacing: 0.3,
                animation: 'tour-pulse 2s ease-in-out infinite',
              }}>{current.waitLabel || 'Interact to continue'}</div>
            ) : (
              <button onClick={isLast ? skip : next} style={{
                padding: '7px 18px', background: 'var(--accent-orange)', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 700,
                fontFamily: 'var(--font-body)', cursor: 'pointer', letterSpacing: 0.3,
              }}>{isLast ? 'Done' : 'Next'}</button>
            )}
          </div>
        </div>
      </div>

      {/* Tour animations */}
      <style>{`
        .tour-spotlight {
          border: 2px solid rgba(249, 199, 79, 0.6);
          box-shadow:
            0 0 0 9999px rgba(0, 0, 0, 0.6),
            0 0 15px 3px rgba(249, 199, 79, 0.5),
            0 0 30px 6px rgba(249, 199, 79, 0.2);
          animation: tour-halo 2s ease-in-out infinite;
        }
        @keyframes tour-halo {
          0%, 100% {
            box-shadow:
              0 0 0 9999px rgba(0, 0, 0, 0.6),
              0 0 15px 3px rgba(249, 199, 79, 0.5),
              0 0 30px 6px rgba(249, 199, 79, 0.2);
          }
          50% {
            box-shadow:
              0 0 0 9999px rgba(0, 0, 0, 0.6),
              0 0 25px 8px rgba(249, 199, 79, 0.7),
              0 0 50px 14px rgba(249, 199, 79, 0.3);
          }
        }
        @keyframes tour-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>,
    document.body,
  );
}
