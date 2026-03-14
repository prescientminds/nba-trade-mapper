'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TeamScoreEntry, SpotlightOptions } from '@/lib/card-templates';
import { SKINS, type VisualSkin } from '@/lib/skins';
import ShareCard from './ShareCard';

type Format = 'og' | 'square' | 'story';

const FORMAT_LABELS: Record<Format, string> = {
  og: 'Twitter / Link Preview',
  square: 'Instagram Post',
  story: 'Instagram Story',
};

const FORMAT_DIMS: Record<Format, { w: number; h: number }> = {
  og: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

const SPOTLIGHT_OPTIONS = [
  { key: 'accolades' as const, label: 'Accolades', defaultOn: true },
  { key: 'winShares' as const, label: 'Win Shares', defaultOn: false },
  { key: 'championships' as const, label: 'Championships', defaultOn: false },
  { key: 'playoffWs' as const, label: 'Playoff WS', defaultOn: false },
  { key: 'seasons' as const, label: 'Seasons', defaultOn: false },
  { key: 'detailedVerdict' as const, label: 'Verdict', defaultOn: false },
];

type SpotlightKey = (typeof SPOTLIGHT_OPTIONS)[number]['key'];

const DEFAULT_SPOTLIGHT: Record<SpotlightKey, boolean> = {
  accolades: true,
  winShares: false,
  championships: false,
  playoffWs: false,
  seasons: false,
  detailedVerdict: false,
};

interface TradeData {
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
  heroUrls: Record<string, string[]>;
}

interface CardPreviewModalProps {
  tradeId: string;
  tradeDate?: string;
  onClose: () => void;
}

/** Convert a proxied image URL to a base64 data URL for html-to-image compatibility. */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function CardPreviewModal({ tradeId, tradeDate, onClose }: CardPreviewModalProps) {
  const [format, setFormat] = useState<Format>('og');
  const [skin, setSkin] = useState<VisualSkin>('classic');
  const [spotlight, setSpotlight] = useState<Record<SpotlightKey, boolean>>({ ...DEFAULT_SPOTLIGHT });
  const [playerCount, setPlayerCount] = useState<1 | 2 | 3>(2);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tradeData, setTradeData] = useState<TradeData | null>(null);
  const [heroDataUrls, setHeroDataUrls] = useState<Record<string, string[]>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Step 1: Fetch trade data on mount ──────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/card-data/${tradeId}`);
        if (!res.ok) throw new Error('fetch failed');
        const data: TradeData = await res.json();
        if (cancelled) return;
        setTradeData(data);

        // Pre-fetch all hero images as data URLs
        const dataUrls: Record<string, string[]> = {};
        await Promise.all(
          Object.entries(data.heroUrls).map(async ([teamId, urls]) => {
            const resolved = await Promise.all(
              urls.slice(0, 3).map(async (u) => {
                try { return await urlToDataUrl(u); } catch { return ''; }
              }),
            );
            dataUrls[teamId] = resolved.filter(Boolean);
          }),
        );
        if (cancelled) return;
        setHeroDataUrls(dataUrls);
      } catch {
        // Trade data fetch failed
      }
    })();
    return () => { cancelled = true; };
  }, [tradeId]);

  // ── Step 2: Capture card whenever options change ───────────
  const captureCard = useCallback(async () => {
    if (!cardRef.current || !tradeData) return;
    setLoading(true);
    setCopied(false);

    // Wait for images to settle in the DOM
    await new Promise((r) => setTimeout(r, 150));
    await document.fonts.ready;

    try {
      // Dynamic import to avoid SSR issues
      const { toPng } = await import('html-to-image');
      const dims = FORMAT_DIMS[format];
      const dataUrl = await toPng(cardRef.current, {
        width: dims.w,
        height: dims.h,
        pixelRatio: 1,
        skipAutoScale: true,
        cacheBust: true,
      });

      // Convert data URL → blob for clipboard + download
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Revoke previous object URL
      setImgUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return objectUrl; });
      setImgBlob(blob);
    } catch (e) {
      console.error('Card capture failed:', e);
      setImgUrl(null);
      setImgBlob(null);
    }
    setLoading(false);
  }, [tradeData, format, skin]);

  // Trigger capture when data or options change (debounced)
  useEffect(() => {
    if (!tradeData) return;
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(captureCard, 200);
    return () => { if (captureTimer.current) clearTimeout(captureTimer.current); };
  }, [tradeData, heroDataUrls, format, skin, playerCount, spotlight, captureCard]);

  // ── Handlers ───────────────────────────────────────────────
  const toggleSpotlight = useCallback((key: SpotlightKey) => {
    setSpotlight((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleDownload = async () => {
    if (!imgUrl || downloading) return;
    setDownloading(true);
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `trade-${tradeId.slice(0, 8)}-${skin}-${format}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloading(false);
  };

  const handleCopy = async () => {
    if (!imgBlob || copied) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imgBlob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not supported */ }
  };

  const dims = FORMAT_DIMS[format];
  const aspect = dims.w / dims.h;

  // Build spotlight as SpotlightOptions
  const spotlightOpts: SpotlightOptions = {
    accolades: spotlight.accolades,
    winShares: spotlight.winShares,
    championships: spotlight.championships,
    playoffWs: spotlight.playoffWs,
    seasons: spotlight.seasons,
    detailedVerdict: spotlight.detailedVerdict,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a24', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 24, maxWidth: 640, width: '90vw',
          maxHeight: '90vh', overflow: 'auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-body)' }}>
            Share Card
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px',
            }}
          >
            &times;
          </button>
        </div>

        {/* Format picker */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(Object.keys(FORMAT_LABELS) as Format[]).map((fmt) => (
            <button
              key={fmt}
              onClick={() => setFormat(fmt)}
              style={{
                flex: 1, padding: '8px 0', fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-body)',
                color: format === fmt ? '#f9c74f' : 'rgba(255,255,255,0.4)',
                background: format === fmt ? 'rgba(249,199,79,0.1)' : 'rgba(255,255,255,0.03)',
                border: format === fmt ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {FORMAT_LABELS[fmt]}
            </button>
          ))}
        </div>

        {/* Skin picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}>
            Skin
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {SKINS.map((s) => {
              const active = skin === s.id;
              return (
                <button key={s.id} onClick={() => setSkin(s.id)} style={{
                  flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 700,
                  fontFamily: 'var(--font-body)',
                  color: active ? '#f9c74f' : 'rgba(255,255,255,0.35)',
                  background: active ? 'rgba(249,199,79,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                  letterSpacing: 1,
                }}>
                  {s.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Player count */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}>
            Players Per Team
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {([1, 2, 3] as const).map((n) => {
              const active = playerCount === n;
              return (
                <button key={n} onClick={() => setPlayerCount(n)} style={{
                  padding: '5px 16px', fontSize: 11, fontWeight: 700,
                  fontFamily: 'var(--font-body)',
                  color: active ? '#f9c74f' : 'rgba(255,255,255,0.35)',
                  background: active ? 'rgba(249,199,79,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Spotlight toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}>
            Spotlight
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SPOTLIGHT_OPTIONS.map((opt) => {
              const active = spotlight[opt.key];
              return (
                <button key={opt.key} onClick={() => toggleSpotlight(opt.key)} style={{
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  color: active ? '#f9c74f' : 'rgba(255,255,255,0.35)',
                  background: active ? 'rgba(249,199,79,0.1)' : 'transparent',
                  border: active ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {active ? '\u2713 ' : ''}{opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div style={{
          background: '#0f0f17', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 200, overflow: 'hidden',
        }}>
          {loading ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: 40, color: 'rgba(255,255,255,0.3)',
              fontSize: 12, fontFamily: 'var(--font-body)',
            }}>
              <div style={{
                width: 14, height: 14,
                border: '2px solid rgba(255,255,255,0.15)',
                borderTopColor: '#f9c74f', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Generating card...
            </div>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt="Trade card preview"
              onError={() => { setImgUrl(null); setImgBlob(null); }}
              style={{ width: '100%', aspectRatio: `${aspect}`, objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <div style={{
              padding: 40, color: 'rgba(255,255,255,0.3)',
              fontSize: 12, fontFamily: 'var(--font-body)',
            }}>
              {tradeData ? 'Failed to generate card' : 'Loading trade data...'}
            </div>
          )}
        </div>

        {/* Dimensions */}
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.25)',
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          {dims.w} &times; {dims.h}px &middot; PNG
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleCopy}
            disabled={!imgBlob}
            style={{
              flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 700,
              fontFamily: 'var(--font-body)',
              color: imgBlob ? '#ffffff' : 'rgba(255,255,255,0.2)',
              background: imgBlob ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: imgBlob ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, cursor: imgBlob ? 'pointer' : 'default', transition: 'all 0.15s',
            }}
          >
            {copied ? 'Copied!' : 'Copy Image'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!imgUrl || downloading}
            style={{
              flex: 2, padding: '14px 0', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-body)',
              color: imgUrl ? '#0f0f17' : 'rgba(255,255,255,0.2)',
              background: imgUrl ? '#f9c74f' : 'rgba(255,255,255,0.06)',
              border: 'none', borderRadius: 8,
              cursor: imgUrl ? 'pointer' : 'default', transition: 'all 0.15s',
            }}
          >
            {downloading ? 'Downloading...' : 'Download Card'}
          </button>
        </div>
      </div>

      {/* ── Hidden card renderer (off-screen, full size) ────── */}
      {tradeData && (
        <div
          ref={cardRef}
          style={{
            position: 'fixed',
            left: '-20000px',
            top: 0,
            width: dims.w,
            height: dims.h,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <ShareCard
            teamScores={tradeData.teamScores}
            winner={tradeData.winner}
            lopsidedness={tradeData.lopsidedness}
            date={tradeDate}
            heroDataUrls={heroDataUrls}
            playerCount={playerCount}
            spotlight={spotlightOpts}
            format={format}
            skin={skin}
          />
        </div>
      )}
    </div>
  );
}
