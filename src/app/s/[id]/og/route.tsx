// Dynamic OG image for shared graphs.
// Trade shares → rich Trade Verdict card with scores + players.
// Other shares → basic title card (player journey, championship, chain).

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { tradeVerdictCard, CARD_TEAM_COLORS } from '@/lib/card-templates';
import { buildHeroImages } from '@/lib/hero-images';

export const runtime = 'edge';

// Lift any team color that's too dark to read on a near-black bg.
// Converts hex → HSL, raises L until relative luminance ≥ 0.35, returns hex.
function clampForBlackBg(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  let r = ((v >> 16) & 0xff) / 255;
  let g = ((v >> 8) & 0xff) / 255;
  let b = (v & 0xff) / 255;

  const lum = (rr: number, gg: number, bb: number) => {
    const ch = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * ch(rr) + 0.7152 * ch(gg) + 0.0722 * ch(bb);
  };
  const target = 0.35;
  if (lum(r, g, b) >= target) return hex;

  // rgb → hsl
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  // Lift L in steps until luminance threshold met
  let L = l;
  for (let i = 0; i < 30 && L < 0.95; i++) {
    L += 0.03;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = L < 0.5 ? L * (1 + s) : L + s - L * s;
    const p = 2 * L - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
    if (lum(r, g, b) >= target) break;
  }
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new Response('Server config error', { status: 500 });
  }

  const sb = createClient(url, key);
  const { data } = await sb
    .from('shared_graphs')
    .select('title, subtitle, teams, league, share_state')
    .eq('id', id)
    .single();

  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  const { title, subtitle, teams, league, share_state } = data;

  // ── Rich Trade Verdict card for trade shares ──────────────────
  if (share_state?.seed?.type === 'trade') {
    const tradeId = share_state.seed.tradeId;
    const { data: scoreData } = await sb
      .from('trade_scores')
      .select('team_scores, winner, lopsidedness')
      .eq('trade_id', tradeId)
      .single();

    if (scoreData) {
      const { primary: heroImages } = buildHeroImages(scoreData.team_scores);
      try {
        return new ImageResponse(
          tradeVerdictCard({
            date: subtitle,
            league,
            teamScores: scoreData.team_scores,
            winner: scoreData.winner,
            lopsidedness: scoreData.lopsidedness,
            heroImages,
            format: 'og',
          }),
          {
            width: 1200,
            height: 630,
            headers: { 'Cache-Control': 'public, max-age=86400' },
          },
        );
      } catch {
        // Satori failed (likely can't fetch NBA CDN headshots from edge).
        // Try again without hero images.
        try {
          return new ImageResponse(
            tradeVerdictCard({
              date: subtitle,
              league,
              teamScores: scoreData.team_scores,
              winner: scoreData.winner,
              lopsidedness: scoreData.lopsidedness,
              format: 'og',
            }),
            {
              width: 1200,
              height: 630,
              headers: { 'Cache-Control': 'public, max-age=3600' },
            },
          );
        } catch {
          // Fall through to basic card below
        }
      }
    }
  }

  // ── Fallback: basic card (player journey, championship, chain, or missing scores) ──

  const teamColors = (teams as string[])
    .map((t: string) => CARD_TEAM_COLORS[t])
    .filter(Boolean)
    .slice(0, 2)
    .map(clampForBlackBg);

  const leftColor = teamColors[0] || '#ff6b35';
  const rightColor = teamColors[1] || teamColors[0] || '#4ecdc4';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0a0a0f',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Top accent bar */}
        <div style={{ display: 'flex', height: 6 }}>
          <div style={{ flex: 1, backgroundColor: leftColor }} />
          <div style={{ flex: 1, backgroundColor: rightColor }} />
        </div>

        {/* Header — site logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '24px 48px 0',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.nbatrademapper.com/og-logo.png"
            alt="NBA Trade Mapper"
            width={72}
            height={72}
          />
        </div>

        {/* Main content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          padding: '0 48px',
          gap: 16,
        }}>
          <div style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 1000,
          }}>
            {title}
          </div>

          {subtitle && (
            <div style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              maxWidth: 800,
            }}>
              {subtitle}
            </div>
          )}

          {teams && (teams as string[]).length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              {(teams as string[]).slice(0, 4).map((teamId: string) => (
                <div
                  key={teamId}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 6,
                    backgroundColor: clampForBlackBg(CARD_TEAM_COLORS[teamId] || '#333'),
                    color: '#ffffff',
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {teamId}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '0 48px 24px',
        }}>
          <div style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.25)',
          }}>
            nbatrademapper.com
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
