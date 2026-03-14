'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { TeamScoreEntry, SpotlightOptions } from '@/lib/card-templates';
import { CARD_TEAM_COLORS } from '@/lib/card-templates';
import { CARD_SKINS, type CardSkin } from '@/lib/skins';
import { useHeadshots } from '@/components/cards/shared/useHeadshots';
import { captureElement, FORMAT_DIMS, FORMAT_LABELS, type Format } from '@/components/cards/shared/capture';
import ShareCard from './ShareCard';

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
  heroUrls?: Record<string, string[]>;
}

interface CardPreviewModalProps {
  tradeId: string;
  tradeDate?: string;
  onClose: () => void;
}

export default function CardPreviewModal({ tradeId, tradeDate, onClose }: CardPreviewModalProps) {
  const [format, setFormat] = useState<Format>('og');
  const [skin, setSkin] = useState<CardSkin>('classic');
  const [spotlight, setSpotlight] = useState<Record<SpotlightKey, boolean>>({ ...DEFAULT_SPOTLIGHT });
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, string[]>>({});
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tradeData, setTradeData] = useState<TradeData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Headshot pipeline: convert proxy URLs → data URLs
  const { headshots, headshotsLoading } = useHeadshots(tradeData?.heroUrls);

  // ── Fetch trade data on mount ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/card-data/${tradeId}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const ts = data.teamScores as Record<string, TeamScoreEntry>;
        setTradeData({
          teamScores: ts,
          winner: data.winner,
          lopsidedness: data.lopsidedness,
          heroUrls: data.heroUrls,
        });
        const allPlayers: Record<string, string[]> = {};
        for (const [teamId, entry] of Object.entries(ts)) {
          allPlayers[teamId] = entry.assets
            .sort((a, b) => b.score - a.score)
            .map(a => a.name);
        }
        setSelectedPlayers(allPlayers);
      } catch {
        // Trade data fetch failed
      }
    })();
    return () => { cancelled = true; };
  }, [tradeId]);

  // ── Capture card whenever options change ───────────────────
  const captureCard = useCallback(async () => {
    if (!cardRef.current || !tradeData) return;
    setLoading(true);
    setCopied(false);

    await new Promise((r) => setTimeout(r, 100));

    try {
      const result = await captureElement(cardRef.current, format);
      setImgUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return result.url; });
      setImgBlob(result.blob);
    } catch (e) {
      console.error('Card capture failed:', e);
      setImgUrl(null);
      setImgBlob(null);
    }
    setLoading(false);
  }, [tradeData, format, skin, headshots]);

  // Trigger capture when data or options change (debounced)
  useEffect(() => {
    if (!tradeData) return;
    if (headshotsLoading) return; // Wait for headshots before first capture
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(captureCard, 200);
    return () => { if (captureTimer.current) clearTimeout(captureTimer.current); };
  }, [tradeData, format, skin, selectedPlayers, spotlight, captureCard, headshotsLoading]);

  // ── Handlers ───────────────────────────────────────────────
  const toggleSpotlight = useCallback((key: SpotlightKey) => {
    setSpotlight((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const togglePlayer = useCallback((teamId: string, playerName: string) => {
    setSelectedPlayers(prev => {
      const current = prev[teamId] || [];
      const isSelected = current.includes(playerName);
      if (isSelected) {
        if (current.length <= 1) return prev;
        return { ...prev, [teamId]: current.filter(n => n !== playerName) };
      }
      return { ...prev, [teamId]: [...current, playerName] };
    });
  }, []);

  const playersByTeam = useMemo(() => {
    if (!tradeData) return [];
    return Object.entries(tradeData.teamScores)
      .map(([teamId, entry]) => ({
        teamId,
        players: [...entry.assets].sort((a, b) => b.score - a.score),
      }));
  }, [tradeData]);

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
            {CARD_SKINS.map((s) => {
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

        {/* Player selection */}
        {playersByTeam.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase',
              fontFamily: 'var(--font-body)',
            }}>
              Players
            </span>
            <div style={{ display: 'flex', gap: 12 }}>
              {playersByTeam.map(({ teamId, players }) => {
                const teamColor = CARD_TEAM_COLORS[teamId] || '#888';
                const sel = selectedPlayers[teamId] || [];
                return (
                  <div key={teamId} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
                      color: teamColor, fontFamily: 'var(--font-body)',
                    }}>
                      {teamId}
                    </span>
                    {players.map((asset) => {
                      const active = sel.includes(asset.name);
                      return (
                        <button
                          key={asset.name}
                          onClick={() => togglePlayer(teamId, asset.name)}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            fontFamily: 'var(--font-body)',
                            textAlign: 'left',
                            color: active ? '#fff' : 'rgba(255,255,255,0.25)',
                            background: active ? `${teamColor}22` : 'transparent',
                            border: active ? `1px solid ${teamColor}55` : '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                            textDecoration: active ? 'none' : 'line-through',
                          }}
                        >
                          {asset.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
          {loading || headshotsLoading ? (
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
              {headshotsLoading ? 'Loading headshots...' : 'Generating card...'}
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
            selectedPlayers={selectedPlayers}
            spotlight={spotlightOpts}
            format={format}
            skin={skin}
            headshots={headshots}
          />
        </div>
      )}
    </div>
  );
}
