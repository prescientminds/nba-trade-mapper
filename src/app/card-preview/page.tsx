'use client';

/**
 * Preview page for the Trade Grade Card.
 * Uses the PG/SGA trade (hardcoded data) for development.
 * Skin switcher to compare all 4 skins. Visit /card-preview
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import TradeGradeCard from '@/components/TradeGradeCard';
import type { TeamScoreEntry } from '@/lib/card-templates';
import type { CardSkin } from '@/lib/skins';
import { CARD_SKINS } from '@/lib/skins';
import { useHeadshots } from '@/components/cards/shared/useHeadshots';

// ── PG/SGA trade data (from Supabase, hardcoded for dev) ─────

const TRADE_ID = 'bbref-2019-07-10-8993a5ee';
const TRADE_DATE = '2019-07-10';

const TEAM_SCORES: Record<string, TeamScoreEntry> = {
  OKC: {
    score: 121.33,
    assets: [
      { ws: 68, name: 'Shai Gilgeous-Alexander', type: 'player', score: 83.34, seasons: 7, accolades: ['All-NBA 1st Team', 'All-NBA 1st Team', 'All-Star', 'All-Star'], playoff_ws: 6.4, championships: 1 },
      { ws: 22.7, name: 'Jalen Williams', type: 'pick', score: 29.18, seasons: 4, accolades: ['All-Rookie Team'], playoff_ws: 3.7, championships: 1 },
      { ws: 6.3, name: 'Danilo Gallinari', type: 'player', score: 6.75, seasons: 1, accolades: [], playoff_ws: 0.3, championships: 0 },
      { ws: 0.9, name: 'Tre Mann', type: 'pick', score: 0.9, seasons: 3, accolades: [], playoff_ws: 0, championships: 0 },
      { ws: 0.8, name: 'Dillon Jones', type: 'pick', score: 1.16, seasons: 1, accolades: [], playoff_ws: 0.2, championships: 1 },
    ],
  },
  LAC: {
    score: 29.25,
    assets: [
      { ws: 23.3, name: 'Paul George', type: 'player', score: 29.25, seasons: 5, accolades: ['All-NBA 3rd Team', 'All-Star', 'All-Star', 'All-Star'], playoff_ws: 2.9, championships: 0 },
    ],
  },
};

const SALARY_DETAILS = {
  OKC: {
    total_acquired: 744658278,
    players: [
      { name: 'Shai Gilgeous-Alexander', acquired_value: 466191922, acquired_seasons: 12 },
      { name: 'Jalen Williams', acquired_value: 247280997, acquired_seasons: 6 },
      { name: 'Danilo Gallinari', acquired_value: 22615559, acquired_seasons: 1 },
      { name: 'Tre Mann', acquired_value: 5947440, acquired_seasons: 2 },
      { name: 'Dillon Jones', acquired_value: 2622360, acquired_seasons: 1 },
    ],
  },
  LAC: {
    total_acquired: 195933514,
    players: [
      { name: 'Paul George', acquired_value: 195933514, acquired_seasons: 5 },
    ],
  },
};

// Hero image URLs (NBA CDN via proxy)
const HERO_URLS: Record<string, string[]> = {
  OKC: ['/api/img?url=' + encodeURIComponent('https://cdn.nba.com/headshots/nba/latest/1040x760/1628983.png')],
  LAC: ['/api/img?url=' + encodeURIComponent('https://cdn.nba.com/headshots/nba/latest/1040x760/202331.png')],
};

export default function CardPreviewPage() {
  const [skin, setSkin] = useState<CardSkin>('noir');
  const { headshots, headshotsLoading } = useHeadshots(HERO_URLS, skin);
  const cardRef = useRef<HTMLDivElement>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const captureCard = useCallback(async () => {
    if (!cardRef.current) return;
    setCapturing(true);
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(cardRef.current, {
      width: 1080,
      height: 1080,
      scale: 1,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    });
    setImgUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    setCapturing(false);
  }, []);

  // Auto-capture when headshots load
  useEffect(() => {
    if (!headshotsLoading && headshots && Object.keys(headshots).length > 0) {
      const t = setTimeout(captureCard, 300);
      return () => clearTimeout(t);
    }
  }, [headshotsLoading, headshots, captureCard]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      padding: 40,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 32,
    }}>
      <h1 style={{
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: 2,
      }}>
        TRADE GRADE CARD — PREVIEW
      </h1>

      {/* Skin switcher */}
      <div style={{ display: 'flex', gap: 8 }}>
        {CARD_SKINS.map(s => (
          <button
            key={s.id}
            onClick={() => setSkin(s.id)}
            style={{
              padding: '8px 20px',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 2,
              color: skin === s.id ? '#0f0f17' : 'rgba(255,255,255,0.6)',
              background: skin === s.id ? '#f9c74f' : 'rgba(255,255,255,0.08)',
              border: skin === s.id ? 'none' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={captureCard}
          disabled={capturing}
          style={{
            padding: '10px 24px',
            fontSize: 13,
            fontWeight: 700,
            color: '#0f0f17',
            background: '#f9c74f',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {capturing ? 'Capturing...' : 'Capture PNG'}
        </button>
        {imgUrl && (
          <a
            href={imgUrl}
            download={`trade-grade-pg-sga-${skin}.png`}
            style={{
              padding: '10px 24px',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            Download
          </a>
        )}
      </div>

      {/* Status */}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
        {headshotsLoading ? 'Loading headshots...' : `Headshots loaded: ${Object.keys(headshots || {}).join(', ')} · Skin: ${skin}`}
      </div>

      {/* Live card */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        overflow: 'hidden',
        width: 540,
        height: 540,
      }}>
        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1080 }}>
          <div ref={cardRef}>
            <TradeGradeCard
              teamScores={TEAM_SCORES}
              winner="OKC"
              lopsidedness={92.08}
              date={TRADE_DATE}
              salaryDetails={SALARY_DETAILS}
              headshots={headshots}
              skin={skin}
            />
          </div>
        </div>
      </div>

      {/* Captured output */}
      {imgUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Captured 1080×1080 PNG ({skin}):
          </div>
          <img
            src={imgUrl}
            alt="Captured trade grade card"
            style={{ width: 540, height: 540, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
          />
        </div>
      )}
    </div>
  );
}
