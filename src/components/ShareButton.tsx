'use client';

import { useState, useCallback } from 'react';
import { useGraphStore } from '@/lib/graph-store';
import { createShareLink } from '@/lib/share';
import { useMobile } from '@/lib/use-mobile';
import { track } from '@/lib/analytics';

const IconShare = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

type ShareState = 'idle' | 'loading' | 'copied' | 'error';

export default function ShareButton() {
  const [shareState, setShareState] = useState<ShareState>('idle');
  const nodes = useGraphStore((s) => s.nodes);
  const seedInfo = useGraphStore((s) => s.seedInfo);
  const visualSkin = useGraphStore((s) => s.visualSkin);
  const isMobile = useMobile();

  const handleShare = useCallback(async () => {
    if (shareState === 'loading' || shareState === 'copied') return;
    setShareState('loading');

    try {
      console.log('[Share] Creating link...');
      const url = await createShareLink();
      console.log('[Share] Result:', url);
      if (!url) {
        track('share_link_failed', { stage: 'create' });
        setShareState('error');
        setTimeout(() => setShareState('idle'), 2000);
        return;
      }

      track('share_link_created', {
        node_count: nodes.length,
        seed_type: seedInfo?.type,
        skin: visualSkin,
        surface: isMobile ? 'mobile' : 'desktop',
      });

      // Try native share on mobile, clipboard on desktop
      if (isMobile && navigator.share) {
        try {
          await navigator.share({ url });
          setShareState('copied');
        } catch {
          // User cancelled share sheet — not an error
          setShareState('idle');
          return;
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          // Clipboard failed — prompt to copy manually
          window.prompt('Copy this link:', url);
        }
        setShareState('copied');
      }

      setTimeout(() => setShareState('idle'), 2500);
    } catch (err) {
      console.error('[Share] Failed:', err);
      track('share_link_failed', { stage: 'exception' });
      setShareState('error');
      setTimeout(() => setShareState('idle'), 2000);
    }
  }, [shareState, isMobile, nodes.length, seedInfo, visualSkin]);

  if (nodes.length === 0 || !seedInfo) return null;

  const label = shareState === 'loading' ? 'Sharing...'
    : shareState === 'copied' ? 'Link Copied!'
    : shareState === 'error' ? 'Failed'
    : isMobile ? undefined : 'Share';

  const icon = shareState === 'copied' ? <IconCheck /> : <IconShare />;
  const accent = shareState === 'copied' ? '#4ecdc4'
    : shareState === 'error' ? '#ff4444'
    : '#ff6b35';

  return (
    <button
      onClick={handleShare}
      disabled={shareState === 'loading'}
      title="Copy shareable link"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: isMobile ? '8px 10px' : '5px 8px',
        minHeight: isMobile ? 36 : 'auto',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
        color: shareState === 'loading' ? 'rgba(255,255,255,0.25)' : accent,
        background: 'transparent',
        border: 'none',
        borderRadius: 4,
        cursor: shareState === 'loading' ? 'wait' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        WebkitTapHighlightColor: 'transparent',
      }}
      onMouseEnter={(e) => {
        if (shareState === 'idle') {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
