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
 * interactive (waitFor) steps with click-through on spotlight targets.
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
  const elevatedRef = useRef<HTMLElement | null>(null);

  // Elevate a React Flow node above the overlay so interactive clicks reach it
  const elevate = (el: Element | null) => {
    // Clean up previous elevation
    if (elevatedRef.current) {
      elevatedRef.current.style.removeProperty('z-index');
      elevatedRef.current.style.removeProperty('position');
      elevatedRef.current = null;
    }
    if (!el) return;
    // Walk up to the .react-flow__node wrapper (or any positioned ancestor)
    const node = el.closest('.react-flow__node') as HTMLElement | null;
    if (node) {
      node.style.zIndex = '10001';
      node.style.position = 'relative';
      elevatedRef.current = node;
    }
  };

  // Track target element position + elevate for interactive steps
  useEffect(() => {
    if (!activeTour || showingWelcome) {
      setRect(null);
      elevate(null);
      return;
    }
    const currentStep = steps[stepIndex];
    if (!currentStep?.target) {
      setRect(null);
      elevate(null);
      return;
    }
    scrolledRef.current = false;
    const isWaiting = !!currentStep.waitFor;

    const interval = setInterval(() => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      if (!scrolledRef.current) {
        if (!isInViewport(r)) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        scrolledRef.current = true;
      }
      // Elevate the node on interactive steps so it sits above the overlay
      if (isWaiting && !elevatedRef.current) {
        elevate(el);
      }
      setRect(r);
    }, 80);
    return () => {
      clearInterval(interval);
      elevate(null);
    };
  }, [activeTour, stepIndex, showingWelcome, steps]);

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
  const W = 320;
  const PAD = 14;
  let pos: React.CSSProperties;

  if (rect) {
    const cx = Math.max(16, Math.min(rect.left + rect.width / 2 - W / 2, window.innerWidth - W - 16));
    if (current.placement === 'bottom') {
      const top = rect.bottom + PAD;
      // If tooltip would overflow bottom, flip to top
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
  return createPortal(
    <>
      {/* Click guard — interactive steps leave a hole for the spotlight target */}
      {isInteractive && rect ? (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: Math.max(0, rect.top - 6), zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: Math.max(0, rect.bottom + 6), left: 0, right: 0, bottom: 0, zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: rect.top - 6, left: 0, width: Math.max(0, rect.left - 6), height: rect.height + 12, zIndex: 9998 }} />
          <div style={{ position: 'fixed', top: rect.top - 6, left: rect.right + 6, right: 0, height: rect.height + 12, zIndex: 9998 }} />
        </>
      ) : (
        <div onClick={skip} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      )}

      {/* Spotlight overlay */}
      {rect ? (
        <div style={{
          position: 'fixed', top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12, borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255,107,53,0.25)',
          zIndex: 9999, pointerEvents: 'none', transition: 'all 0.35s ease-out',
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

      {/* Pulse animation for interactive hint */}
      <style>{`
        @keyframes tour-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </>,
    document.body,
  );
}
