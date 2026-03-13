'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { SKINS, type VisualSkin } from '@/lib/skins';
import type { CardSkin } from '@/lib/card-templates';

type Format = 'og' | 'square' | 'story';

// Map graph visual skins to card skins (same IDs)
const toCardSkin = (vs: VisualSkin): CardSkin => vs as CardSkin;

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
  { key: 'accolades', label: 'Accolades', defaultOn: true },
  { key: 'winShares', label: 'Win Shares', defaultOn: false },
  { key: 'championships', label: 'Championships', defaultOn: false },
  { key: 'playoffWs', label: 'Playoff WS', defaultOn: false },
  { key: 'seasons', label: 'Seasons', defaultOn: false },
  { key: 'detailedVerdict', label: 'Detailed Verdict', defaultOn: false },
] as const;

type SpotlightKey = (typeof SPOTLIGHT_OPTIONS)[number]['key'];

const DEFAULT_SPOTLIGHT: Record<SpotlightKey, boolean> = {
  accolades: true,
  winShares: false,
  championships: false,
  playoffWs: false,
  seasons: false,
  detailedVerdict: false,
};

interface CardPreviewModalProps {
  tradeId: string;
  tradeDate?: string;
  initialSkin?: VisualSkin;
  onClose: () => void;
}

export default function CardPreviewModal({ tradeId, tradeDate, initialSkin, onClose }: CardPreviewModalProps) {
  const [format, setFormat] = useState<Format>('og');
  const [skin, setSkin] = useState<VisualSkin>(initialSkin || 'classic');
  const [spotlight, setSpotlight] = useState<Record<SpotlightKey, boolean>>({ ...DEFAULT_SPOTLIGHT });
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildUrl = useCallback((fmt: Format, sk: VisualSkin, spot: Record<SpotlightKey, boolean>) => {
    const params = new URLSearchParams();
    params.set('format', fmt);
    if (sk !== 'classic') params.set('skin', toCardSkin(sk));
    if (tradeDate) params.set('date', tradeDate);
    // Only send non-default spotlight values to keep URL short
    for (const opt of SPOTLIGHT_OPTIONS) {
      if (spot[opt.key] !== opt.defaultOn) {
        params.set(opt.key, String(spot[opt.key]));
      }
    }
    return `/api/card/trade/${tradeId}?${params.toString()}`;
  }, [tradeId, tradeDate]);

  const fetchCard = useCallback(async (fmt: Format, sk: VisualSkin, spot: Record<SpotlightKey, boolean>) => {
    setLoading(true);
    setImgUrl(null);
    setImgBlob(null);
    setCopied(false);
    try {
      const res = await fetch(buildUrl(fmt, sk, spot));
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setImgUrl(url);
      setImgBlob(blob);
    } catch {
      setImgUrl(null);
      setImgBlob(null);
    }
    setLoading(false);
  }, [buildUrl]);

  // Fetch on format or skin change (immediate)
  useEffect(() => {
    fetchCard(format, skin, spotlight);
    return () => { if (imgUrl) URL.revokeObjectURL(imgUrl); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, skin]);

  // Debounced fetch on spotlight change
  const toggleSpotlight = useCallback((key: SpotlightKey) => {
    setSpotlight(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Debounce the fetch
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchCard(format, skin, next);
      }, 300);
      return next;
    });
  }, [format, skin, fetchCard]);

  const handleDownload = async () => {
    if (!imgUrl || downloading) return;
    setDownloading(true);
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `trade-${tradeId.slice(0, 8)}-${format}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloading(false);
  };

  const handleCopy = async () => {
    if (!imgBlob || copied) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': imgBlob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: some browsers don't support clipboard image write
    }
  };

  const dims = FORMAT_DIMS[format];
  const aspect = dims.w / dims.h;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a24',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          padding: 24,
          maxWidth: 640,
          width: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: '#fff',
            fontFamily: 'var(--font-body)',
          }}>
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
                flex: 1,
                padding: '8px 0',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                color: format === fmt ? '#f9c74f' : 'rgba(255,255,255,0.4)',
                background: format === fmt ? 'rgba(249,199,79,0.1)' : 'rgba(255,255,255,0.03)',
                border: format === fmt ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.15s',
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
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}>
            Skin
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {SKINS.map((s) => {
              const active = skin === s.id;
              const skinAccent = s.id === 'holographic'
                ? 'linear-gradient(135deg, #ff6b35, #9b5de5)'
                : s.id === 'insideStuff'
                  ? 'linear-gradient(135deg, #f5a623, #e8742a)'
                  : s.id === 'nbaJam'
                    ? 'linear-gradient(135deg, #00CCCC, #008888)'
                    : undefined;
              return (
                <button
                  key={s.id}
                  onClick={() => setSkin(s.id)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'var(--font-body)',
                    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
                    background: active
                      ? (skinAccent || '#f9c74f')
                      : 'transparent',
                    border: active
                      ? '1px solid transparent'
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    letterSpacing: 0.5,
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Spotlight toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
          }}>
            Spotlight
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SPOTLIGHT_OPTIONS.map((opt) => {
              const active = spotlight[opt.key];
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleSpotlight(opt.key)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    color: active ? '#f9c74f' : 'rgba(255,255,255,0.35)',
                    background: active ? 'rgba(249,199,79,0.1)' : 'transparent',
                    border: active
                      ? '1px solid rgba(249,199,79,0.3)'
                      : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {active ? '\u2713 ' : ''}{opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div style={{
          background: '#0f0f17',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          overflow: 'hidden',
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
                borderTopColor: '#f9c74f',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              Generating card...
            </div>
          ) : imgUrl ? (
            <img
              src={imgUrl}
              alt="Trade card preview"
              style={{
                width: '100%',
                aspectRatio: `${aspect}`,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <div style={{
              padding: 40, color: 'rgba(255,255,255,0.3)',
              fontSize: 12, fontFamily: 'var(--font-body)',
            }}>
              Failed to generate card
            </div>
          )}
        </div>

        {/* Dimensions label */}
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.25)',
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          {dims.w} &times; {dims.h}px &middot; PNG
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Copy to clipboard */}
          <button
            onClick={handleCopy}
            disabled={!imgBlob}
            style={{
              flex: 1,
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              color: imgBlob ? '#ffffff' : 'rgba(255,255,255,0.2)',
              background: imgBlob ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: imgBlob ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              cursor: imgBlob ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (imgBlob) e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            }}
            onMouseLeave={(e) => {
              if (imgBlob) e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            }}
          >
            {copied ? 'Copied!' : 'Copy Image'}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={!imgUrl || downloading}
            style={{
              flex: 2,
              padding: '14px 0',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              color: imgUrl ? '#0f0f17' : 'rgba(255,255,255,0.2)',
              background: imgUrl ? '#f9c74f' : 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              cursor: imgUrl ? 'pointer' : 'default',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (imgUrl) e.currentTarget.style.background = '#fad366';
            }}
            onMouseLeave={(e) => {
              if (imgUrl) e.currentTarget.style.background = '#f9c74f';
            }}
          >
            {downloading ? 'Downloading...' : 'Download Card'}
          </button>
        </div>
      </div>
    </div>
  );
}
