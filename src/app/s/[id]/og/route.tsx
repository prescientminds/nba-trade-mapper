// Dynamic OG image for shared graphs.
// Trade shares → rich Trade Verdict card with scores + players.
// Other shares → basic title card (player journey, championship, chain).

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { tradeVerdictCard, CARD_TEAM_COLORS } from '@/lib/card-templates';
import { buildHeroImages } from '@/lib/hero-images';

export const runtime = 'edge';

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
      const heroImages = buildHeroImages(scoreData.team_scores);
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
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        },
      );
    }
  }

  // ── Fallback: basic card (player journey, championship, chain, or missing scores) ──

  const teamColors = (teams as string[])
    .map((t: string) => CARD_TEAM_COLORS[t])
    .filter(Boolean)
    .slice(0, 2);

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

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 48px 0',
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase' as const,
          }}>
            {league === 'WNBA' ? 'WNBA' : 'NBA'} TRADE MAPPER
          </div>
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
                    backgroundColor: CARD_TEAM_COLORS[teamId] || '#333',
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
            nbatrades.vercel.app
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  );
}
