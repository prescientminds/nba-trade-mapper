'use client';

/**
 * Share for a hypothetical-trade card.
 *
 * The share IS the card: clicking Share renders the canvas card (teams,
 * what each side receives, the LEGAL/ILLEGAL verdict) to a PNG and opens a
 * sheet that previews exactly that image. From there: send it (native share
 * sheet — Messages, WhatsApp, Save Image on iOS), save it, copy it, or copy
 * the /s/{id} replay link.
 *
 * Capture clones the card out of React Flow's transformed viewport into an
 * untransformed offscreen wrapper, so the image is the same at any zoom.
 * Elements marked `data-capture-hide` (buttons, close ✕) are dropped;
 * `data-capture-only` (the site watermark) is revealed.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { createHypotheticalShareLink } from '@/lib/share';
import { useMobile } from '@/lib/use-mobile';
import { track } from '@/lib/analytics';

const CARD_BG = '#0e0e14';

async function renderCardPng(card: HTMLElement): Promise<Blob> {
  const clone = card.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[data-capture-hide]').forEach((el) => el.remove());
  clone.querySelectorAll<HTMLElement>('[data-capture-only]').forEach((el) => {
    el.style.display = 'block';
  });
  clone.querySelectorAll('.react-flow__handle').forEach((el) => el.remove());
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed;left:-10000px;top:0;width:max-content;padding:18px 14px 12px;background:${CARD_BG};`;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);
  try {
    // html-to-image renders through SVG foreignObject, so text lays out with
    // the browser's own engine — html2canvas clipped the ellipsized rows.
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(wrapper, {
      pixelRatio: 4,
      backgroundColor: CARD_BG,
      cacheBust: true,
      // The offscreen offset is copied onto the rendered root — undo it there.
      style: { position: 'static', left: '0', top: '0' },
    });
    if (!blob) throw new Error('toBlob returned null');
    return blob;
  } finally {
    wrapper.remove();
  }
}

type Status = { kind: 'idle' } | { kind: 'busy'; label: string } | { kind: 'done'; label: string } | { kind: 'error'; label: string };

export default function HypotheticalShareSheet({
  nodeId,
  cardRef,
  enabled,
  comparableCount,
  accent,
}: {
  nodeId: string;
  cardRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  comparableCount: number;
  accent: string;
}) {
  const isMobile = useMobile();
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const linkRef = useRef<string | null>(null);

  const surface = isMobile ? 'mobile' : 'desktop';
  const fileName = `trade-${nodeId.slice(-6)}.png`;
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canSendFile =
    !!file && typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  const canCopyImage = typeof window !== 'undefined' && 'ClipboardItem' in window && !isMobile;

  // Object URL for the preview. Revoked when replaced and on unmount — kept in
  // a ref so StrictMode's mount-time effect replay can't revoke a live URL.
  const urlRef = useRef<string | null>(null);
  const replacePreview = useCallback((next: string | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setPreviewUrl(next);
  }, []);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const openSheet = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!enabled || !cardRef.current) return;
      setOpen(true);
      setBlob(null);
      replacePreview(null);
      setRenderError(false);
      setStatus({ kind: 'idle' });
      linkRef.current = null;
      try {
        const png = await renderCardPng(cardRef.current);
        setBlob(png);
        replacePreview(URL.createObjectURL(png));
        track('share_image_rendered', { source: 'hypothetical_node', surface });
      } catch (err) {
        console.error('[HypotheticalShareSheet] render failed:', err);
        setRenderError(true);
        track('share_link_failed', { stage: 'image_render', source: 'hypothetical_node' });
      }
    },
    [enabled, cardRef, surface, replacePreview],
  );


  const flash = (s: Status) => {
    setStatus(s);
    setTimeout(() => setStatus({ kind: 'idle' }), 2200);
  };

  const sendImage = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
      track('share_image_sent', { source: 'hypothetical_node', surface });
    } catch {
      /* user dismissed the sheet */
    }
  };

  const saveImage = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = fileName;
    a.click();
    track('share_image_saved', { source: 'hypothetical_node', surface });
    flash({ kind: 'done', label: 'Saved' });
  };

  const copyImage = async () => {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      track('share_image_copied', { source: 'hypothetical_node', surface });
      flash({ kind: 'done', label: 'Image copied' });
    } catch {
      flash({ kind: 'error', label: 'Copy failed — use Save' });
    }
  };

  const copyLink = async () => {
    setStatus({ kind: 'busy', label: 'Making link…' });
    try {
      const url = linkRef.current ?? (await createHypotheticalShareLink(nodeId));
      if (!url) {
        track('share_link_failed', { stage: 'create', source: 'hypothetical_node' });
        flash({ kind: 'error', label: 'Link failed' });
        return;
      }
      linkRef.current = url;
      track('share_link_created', { source: 'hypothetical_node', comparable_count: comparableCount, surface });
      try {
        await navigator.clipboard.writeText(url);
        flash({ kind: 'done', label: 'Link copied' });
      } catch {
        window.prompt('Copy this link:', url);
        setStatus({ kind: 'idle' });
      }
    } catch (err) {
      console.error('[HypotheticalShareSheet] link failed:', err);
      track('share_link_failed', { stage: 'exception', source: 'hypothetical_node' });
      flash({ kind: 'error', label: 'Link failed' });
    }
  };

  return (
    <>
      <button
        type="button"
        className="nopan nodrag"
        data-share-button
        data-node-id={nodeId}
        disabled={!enabled}
        onClick={openSheet}
        title={enabled ? 'Share this trade as an image' : 'Add players or picks to share'}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          padding: '3px 7px',
          borderRadius: 3,
          border: `1px solid ${enabled ? accent : 'var(--border-subtle)'}`,
          background: enabled ? `${accent}1a` : 'transparent',
          color: enabled ? accent : 'var(--text-muted)',
          cursor: enabled ? 'pointer' : 'not-allowed',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        Share
      </button>

      {open &&
        createPortal(
          <div
            data-share-sheet
            // Portal events still bubble through the React tree to the card,
            // whose onClick toggles the editor — stop them here.
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: isMobile ? 'flex-end' : 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-body)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: isMobile ? '100%' : 420,
                maxHeight: isMobile ? '92dvh' : '88vh',
                overflowY: 'auto',
                background: CARD_BG,
                border: '1px solid var(--border-medium)',
                borderRadius: isMobile ? '14px 14px 0 0' : 12,
                padding: 16,
                paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-primary)',
                  }}
                >
                  Share this trade
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    border: 'none',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  minHeight: 140,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-subtle)',
                  padding: 10,
                }}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Image of this trade"
                    data-share-preview
                    style={{ maxWidth: '100%', maxHeight: isMobile ? '48dvh' : 420, display: 'block', borderRadius: 4 }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: renderError ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                    {renderError ? 'Couldn’t render the image. Copy the link instead.' : 'Rendering image…'}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {canSendFile && (
                  <SheetButton primary onClick={sendImage} wide>
                    Send image
                  </SheetButton>
                )}
                <SheetButton primary={!canSendFile} disabled={!blob} onClick={saveImage}>
                  Save image
                </SheetButton>
                {canCopyImage ? (
                  <SheetButton disabled={!blob} onClick={copyImage}>
                    Copy image
                  </SheetButton>
                ) : null}
                <SheetButton onClick={copyLink} disabled={status.kind === 'busy'} wide={canCopyImage}>
                  Copy link
                </SheetButton>
              </div>

              <div
                aria-live="polite"
                style={{
                  minHeight: 16,
                  fontSize: 12,
                  textAlign: 'center',
                  color:
                    status.kind === 'error' ? 'var(--accent-red)'
                    : status.kind === 'done' ? 'var(--accent-green)'
                    : 'var(--text-muted)',
                }}
              >
                {status.kind === 'idle' ? 'The link opens this trade on the canvas.' : status.label}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function SheetButton({
  children,
  onClick,
  disabled,
  primary,
  wide,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        gridColumn: wide ? '1 / -1' : undefined,
        padding: '11px 12px',
        borderRadius: 8,
        border: `1px solid ${primary ? 'var(--accent-orange)' : 'var(--border-medium)'}`,
        background: primary ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)',
        color: primary ? '#fff' : 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
