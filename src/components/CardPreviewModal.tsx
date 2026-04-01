'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
// createPortal removed — off-screen rendering for both card types
import type { TeamScoreEntry, SpotlightOptions } from '@/lib/card-templates';
import { CARD_TEAM_COLORS, CARD_TEAM_SECONDARY } from '@/lib/card-templates';
import { CARD_SKINS, type CardSkin } from '@/lib/skins';
import { useHeadshots } from '@/components/cards/shared/useHeadshots';
import { useTemplates } from '@/components/cards/shared/useTemplates';
import { useWatermark } from '@/components/cards/shared/useWatermark';
import { captureElement, FORMAT_DIMS, FORMAT_LABELS, type Format } from '@/components/cards/shared/capture';
import ShareCard from './ShareCard';
import TradeGradeCard from './TradeGradeCard';
import { useTourStore } from '@/lib/tour-store';
// Share tour is now merged into the main guided tour

type CardType = 'score' | 'grade';

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
  fallbackHeroUrls?: Record<string, string[]>;
  salaryDetails?: Record<string, { total_acquired: number; players: { name: string; acquired_value: number; acquired_seasons: number }[] }>;
}

interface CardPreviewModalProps {
  tradeId: string;
  tradeDate?: string;
  onClose: () => void;
}

export default function CardPreviewModal({ tradeId, tradeDate, onClose }: CardPreviewModalProps) {
  const [cardType, setCardType] = useState<CardType>('score');
  const [format, setFormat] = useState<Format>('square');
  const [skin, setSkin] = useState<CardSkin>('classic');
  const [draftCaption, setDraftCaption] = useState('');
  const [savedCaption, setSavedCaption] = useState('');
  const [captionEditing, setCaptionEditing] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
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

  // Headshot pipeline: fetch → data URL → per-skin color grading (BBRef fallback for retired players)
  const { headshots, headshotsLoading } = useHeadshots(tradeData?.heroUrls, skin, tradeData?.fallbackHeroUrls);

  // Watermark pipeline: preload as data URL for html2canvas
  const watermarkUrl = useWatermark();

  // Template pipeline: load grayscale texture → tint per team
  const teamColors = useMemo(() => {
    if (!tradeData) return undefined;
    const result: Record<string, { primary: string; secondary: string }> = {};
    for (const teamId of Object.keys(tradeData.teamScores)) {
      result[teamId] = {
        primary: CARD_TEAM_COLORS[teamId] || '#888888',
        secondary: CARD_TEAM_SECONDARY[teamId] || CARD_TEAM_COLORS[teamId] || '#888888',
      };
    }
    return result;
  }, [tradeData]);
  const { templates, templatesLoading } = useTemplates(teamColors, skin);

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
          fallbackHeroUrls: data.fallbackHeroUrls,
          salaryDetails: data.salaryDetails,
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

  // Grade card is always square; score card uses selected format
  const effectiveFormat = cardType === 'grade' ? 'square' as Format : format;

  // Clear stale preview immediately when card type or format changes
  // (prevents showing old PNG at wrong aspect ratio)
  useEffect(() => {
    setImgUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setImgBlob(null);
    setLoading(true);
  }, [cardType, effectiveFormat]);

  // ── Capture card whenever options change ───────────────────
  const captureCard = useCallback(async () => {
    if (!cardRef.current || !tradeData) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setCopied(false);

    // Wait for layout + ensure all images in the card are fully decoded
    await new Promise((r) => setTimeout(r, 500));
    if (!cardRef.current) { setLoading(false); return; }

    const imgs = cardRef.current.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img => img.decode().catch(() => {})));

    try {
      const result = await captureElement(cardRef.current, effectiveFormat);
      setImgUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return result.url; });
      setImgBlob(result.blob);
    } catch (e) {
      console.error('Card capture failed:', e);
      setImgUrl(null);
      setImgBlob(null);
    } finally {
      setLoading(false);
    }
  }, [tradeData, effectiveFormat, skin, headshots, templates, cardType, savedCaption]);

  // Trigger capture when data or options change (debounced)
  useEffect(() => {
    if (!tradeData) return;
    if (headshotsLoading || templatesLoading) return; // Wait for assets before first capture
    if (captureTimer.current) clearTimeout(captureTimer.current);
    captureTimer.current = setTimeout(captureCard, 200);
    return () => { if (captureTimer.current) clearTimeout(captureTimer.current); };
  }, [tradeData, effectiveFormat, skin, selectedPlayers, spotlight, captureCard, headshotsLoading, templatesLoading, cardType, savedCaption]);

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
      .map(([teamId, entry]) => {
        const seen = new Set<string>();
        const deduped = [...entry.assets].sort((a, b) => b.score - a.score).filter(a => {
          if (seen.has(a.name)) return false;
          seen.add(a.name);
          return true;
        });
        return { teamId, players: deduped };
      });
  }, [tradeData]);

  const handleDownload = async () => {
    if (!imgUrl || downloading) return;
    setDownloading(true);
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = `trade-${tradeId.slice(0, 8)}-${cardType}-${skin}-${effectiveFormat}.png`;
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

  const handleShare = async () => {
    if (!imgBlob || sharing) return;
    setSharing(true);
    try {
      const file = new File(
        [imgBlob],
        `trade-${tradeId.slice(0, 8)}-${cardType}-${skin}.png`,
        { type: 'image/png' },
      );
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        await navigator.share({ text: 'NBA Trade Mapper' });
      }
    } catch {
      // User cancelled share sheet
    } finally {
      setSharing(false);
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const dims = FORMAT_DIMS[effectiveFormat];

  const spotlightOpts: SpotlightOptions = {
    accolades: spotlight.accolades,
    winShares: spotlight.winShares,
    championships: spotlight.championships,
    playoffWs: spotlight.playoffWs,
    seasons: spotlight.seasons,
    detailedVerdict: spotlight.detailedVerdict,
  };

  // ── Section label (shared style) ──────────────────────────
  const sectionLabel = (text: string) => (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 2,
      color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' as const,
      fontFamily: 'var(--font-body)',
    }}>
      {text}
    </span>
  );

  // ── Pill button style (format, skin, spotlight) ────────────
  const pillBtn = (active: boolean, gold = false) => ({
    flex: 1 as const,
    padding: isMobile ? '8px 0' : '5px 0',
    fontSize: isMobile ? 11 : 10,
    fontWeight: 700 as const,
    fontFamily: 'var(--font-body)',
    color: active ? (gold ? '#f9c74f' : '#fff') : 'rgba(255,255,255,0.5)',
    background: active ? (gold ? 'rgba(249,199,79,0.1)' : 'rgba(255,255,255,0.1)') : 'transparent',
    border: active
      ? `1px solid ${gold ? 'rgba(249,199,79,0.3)' : 'rgba(255,255,255,0.2)'}`
      : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 6,
    cursor: 'pointer' as const,
    transition: 'all 0.15s',
    letterSpacing: gold ? 1 : 0.5,
    WebkitTapHighlightColor: 'transparent' as const,
  });

  // ── Preview image ──────────────────────────────────────────
  const previewContent = (
    <div data-tour="share-preview" style={{
      width: '100%',
      background: '#0f0f17', borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      // On mobile: fixed aspect ratio box. On desktop: flex-fill.
      ...(isMobile
        ? { aspectRatio: `${dims.w} / ${dims.h}`, maxHeight: '40vh', minHeight: 200 }
        : { flex: 1, minHeight: 0 }),
    }}>
      {loading || headshotsLoading || templatesLoading ? (
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
          {headshotsLoading ? 'Loading headshots...' : templatesLoading ? 'Tinting templates...' : 'Generating card...'}
        </div>
      ) : imgUrl ? (
        <img
          src={imgUrl}
          alt="Trade card preview"
          onError={() => { setImgUrl(null); setImgBlob(null); }}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
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
  );

  // ── Controls panel (shared between layouts) ────────────────
  const controls = (
    <>
      {/* Card type toggle */}
      <div data-tour="share-card-type" style={{ display: 'flex', gap: 4 }}>
        {([['score', 'Score Card'], ['grade', 'Grade Card']] as [CardType, string][]).map(([type, label]) => (
          <button key={type} onClick={() => setCardType(type)} style={pillBtn(cardType === type)}>
            {label}
          </button>
        ))}
      </div>

      {/* Format + Skin — side by side on mobile to save vertical space */}
      {isMobile ? (
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Format (score card only) */}
          {cardType === 'score' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sectionLabel('Format')}
              <div style={{ display: 'flex', gap: 3 }}>
                {(['square', 'og', 'story'] as Format[]).map((f) => (
                  <button key={f} onClick={() => setFormat(f)} style={pillBtn(format === f, true)}>
                    {f === 'square' ? 'Square' : f === 'og' ? 'OG' : 'Story'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Skin */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sectionLabel('Skin')}
            <div style={{ display: 'flex', gap: 3 }}>
              {CARD_SKINS.map((s) => (
                <button key={s.id} onClick={() => setSkin(s.id)} style={pillBtn(skin === s.id, true)}>
                  {s.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Format picker (score card only) — desktop stacked */}
          {cardType === 'score' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sectionLabel('Format')}
              <div style={{ display: 'flex', gap: 4 }}>
                {(['square', 'og', 'story'] as Format[]).map((f) => (
                  <button key={f} onClick={() => setFormat(f)} style={pillBtn(format === f, true)}>
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Skin picker — desktop stacked */}
          <div data-tour="share-skin" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sectionLabel('Skin')}
            <div style={{ display: 'flex', gap: 4 }}>
              {CARD_SKINS.map((s) => (
                <button key={s.id} onClick={() => setSkin(s.id)} style={pillBtn(skin === s.id, true)}>
                  {s.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Player selection */}
      {playersByTeam.length > 0 && (
        <div data-tour="share-players" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sectionLabel('Players')}
          <div style={{ display: 'flex', gap: 8 }}>
            {playersByTeam.map(({ teamId, players }) => {
              const teamColor = CARD_TEAM_COLORS[teamId] || '#888';
              const sel = selectedPlayers[teamId] || [];
              return (
                <div key={teamId} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                          padding: isMobile ? '6px 8px' : '3px 8px',
                          fontSize: isMobile ? 11 : 10, fontWeight: 600,
                          fontFamily: 'var(--font-body)',
                          textAlign: 'left' as const,
                          color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                          background: active ? `${teamColor}22` : 'transparent',
                          border: active ? `1px solid ${teamColor}55` : '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                          textDecoration: active ? 'none' : 'line-through',
                          WebkitTapHighlightColor: 'transparent',
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

      {/* Caption */}
      <div data-tour="share-caption" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sectionLabel('Hot Take')}
        {captionEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              placeholder="Add a take..."
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 12,
                fontFamily: 'var(--font-body)',
                color: '#fff', background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${draftCaption.length > 140 ? 'rgba(255,80,80,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 6, resize: 'none', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: draftCaption.length > 140 ? '#ff5050' : 'rgba(255,255,255,0.25)',
                whiteSpace: 'nowrap',
              }}>
                {draftCaption.length}/140
              </span>
              <button
                onClick={() => { setSavedCaption(draftCaption.slice(0, 140)); setCaptionEditing(false); }}
                disabled={!draftCaption.trim() || draftCaption.length > 140}
                style={{
                  flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 700,
                  fontFamily: 'var(--font-body)', letterSpacing: 0.5,
                  color: draftCaption.trim() && draftCaption.length <= 140 ? '#0f0f17' : 'rgba(255,255,255,0.2)',
                  background: draftCaption.trim() && draftCaption.length <= 140 ? '#f9c74f' : 'rgba(255,255,255,0.06)',
                  border: 'none', borderRadius: 6,
                  cursor: draftCaption.trim() && draftCaption.length <= 140 ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {savedCaption && (
              <div style={{
                padding: '8px 10px', fontSize: 12,
                fontFamily: 'var(--font-body)',
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6, lineHeight: 1.4,
              }}>
                {savedCaption}
              </div>
            )}
            <button
              onClick={() => setCaptionEditing(true)}
              style={{
                padding: '6px 0', fontSize: 11, fontWeight: 700,
                fontFamily: 'var(--font-body)', letterSpacing: 0.5,
                color: '#fff', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 6, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Spotlight toggles */}
      <div data-tour="share-spotlight" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sectionLabel('Spotlight')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {SPOTLIGHT_OPTIONS.map((opt) => {
            const active = spotlight[opt.key];
            return (
              <button key={opt.key} onClick={() => toggleSpotlight(opt.key)} style={{
                padding: isMobile ? '6px 10px' : '4px 10px',
                fontSize: isMobile ? 11 : 10, fontWeight: 600,
                fontFamily: 'var(--font-body)',
                color: active ? '#f9c74f' : 'rgba(255,255,255,0.5)',
                background: active ? 'rgba(249,199,79,0.1)' : 'transparent',
                border: active ? '1px solid rgba(249,199,79,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {active ? '\u2713 ' : ''}{opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  // ── Action buttons ─────────────────────────────────────────
  const actionButtons = (
    <div data-tour="share-actions" style={{ display: 'flex', gap: 8, flexDirection: isMobile && canNativeShare ? 'column' : 'row' }}>
      {/* Native share — primary on mobile */}
      {isMobile && canNativeShare && (
        <button
          onClick={handleShare}
          disabled={!imgBlob || sharing}
          style={{
            padding: '14px 0', fontSize: 14, fontWeight: 700,
            fontFamily: 'var(--font-body)',
            color: imgBlob ? '#0f0f17' : 'rgba(255,255,255,0.2)',
            background: imgBlob ? '#f9c74f' : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: 8,
            cursor: imgBlob ? 'pointer' : 'default', transition: 'all 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {sharing ? 'Sharing...' : 'Share'}
        </button>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleDownload}
          disabled={!imgUrl || downloading}
          style={{
            flex: 1,
            minWidth: 120,
            padding: isMobile ? '14px 24px' : '12px 24px',
            fontSize: 13, fontWeight: 700,
            fontFamily: 'var(--font-body)',
            color: imgUrl ? '#0f0f17' : 'rgba(255,255,255,0.2)',
            background: imgUrl ? '#f9c74f' : 'rgba(255,255,255,0.06)',
            border: imgUrl ? '1px solid rgba(249,199,79,0.5)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8,
            cursor: imgUrl ? 'pointer' : 'default', transition: 'all 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {downloading ? 'Downloading...' : 'Download'}
        </button>
        <button
          onClick={handleCopy}
          disabled={!imgBlob}
          style={{
            flex: 1,
            minWidth: 120,
            padding: isMobile ? '14px 24px' : '12px 24px',
            fontSize: 13, fontWeight: 700,
            fontFamily: 'var(--font-body)',
            color: imgBlob ? '#ffffff' : 'rgba(255,255,255,0.2)',
            background: imgBlob ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
            border: imgBlob ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, cursor: imgBlob ? 'pointer' : 'default', transition: 'all 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {copied ? 'Copied!' : 'Copy Image'}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // MOBILE LAYOUT — full-screen takeover, preview hero, scrollable controls, pinned buttons
  // ══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: '#1a1a24',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* ── Header bar ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-body)' }}>
              Share Card
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '4px 8px',
              }}
            >
              &times;
            </button>
          </div>

          {/* ── Scrollable body ── */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, minHeight: 0,
              overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: '12px 16px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {/* Preview — hero position */}
            {previewContent}

            {/* Dimension label */}
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.25)',
              fontFamily: 'var(--font-mono)', textAlign: 'center',
              marginTop: -8,
            }}>
              {dims.w} &times; {dims.h}px &middot; PNG
            </div>

            {/* Controls */}
            {controls}

            {/* Action buttons — inline at bottom of scroll area */}
            <div style={{ marginTop: 8 }}>
              {actionButtons}
            </div>
          </div>
        </div>

        {/* ── Hidden card renderer ── */}
        {tradeData && (
          <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none', zIndex: -1 }}>
            <div ref={cardRef}>
              {cardType === 'grade' ? (
                <TradeGradeCard
                  teamScores={tradeData.teamScores}
                  winner={tradeData.winner}
                  lopsidedness={tradeData.lopsidedness}
                  date={tradeDate}
                  salaryDetails={tradeData.salaryDetails}
                  headshots={headshots}
                  skin={skin}
                  caption={savedCaption}
                  selectedPlayers={selectedPlayers}
                  watermarkUrl={watermarkUrl}
                />
              ) : (
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
                  templates={templates}
                  caption={savedCaption}
                  watermarkUrl={watermarkUrl}
                />
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT — side-by-side modal (unchanged)
  // ══════════════════════════════════════════════════════════════
  // Share tour is now part of the main guided tour — no separate auto-start

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
          padding: 24, maxWidth: 1200, width: '95vw', maxHeight: '90vh',
          display: 'flex', gap: 20,
        }}
      >
        {/* ── LEFT: Controls ── */}
        <div style={{
          width: 280, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 12,
          overflowY: 'auto',
        }}>
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

          {controls}

          {/* Spacer pushes buttons to bottom */}
          <div style={{ flex: 1 }} />

          {actionButtons}
        </div>

        {/* ── RIGHT: Preview ── */}
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 8,
        }}>
          {previewContent}
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.25)',
            fontFamily: 'var(--font-mono)',
          }}>
            {dims.w} &times; {dims.h}px &middot; PNG
          </div>
        </div>
      </div>

      {/* ── Hidden card renderer (full-size, off-screen) ────── */}
      {tradeData && (
        <div style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          pointerEvents: 'none',
          zIndex: -1,
        }}>
          <div ref={cardRef}>
            {cardType === 'grade' ? (
              <TradeGradeCard
                teamScores={tradeData.teamScores}
                winner={tradeData.winner}
                lopsidedness={tradeData.lopsidedness}
                date={tradeDate}
                salaryDetails={tradeData.salaryDetails}
                headshots={headshots}
                skin={skin}
                caption={savedCaption}
                selectedPlayers={selectedPlayers}
                watermarkUrl={watermarkUrl}
              />
            ) : (
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
                templates={templates}
                caption={savedCaption}
                watermarkUrl={watermarkUrl}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
