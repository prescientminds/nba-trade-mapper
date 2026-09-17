/**
 * OG card for a trade permalink.
 *
 * Mirrors `/s/[id]/og` but keyed by readable slug. Runs on the Node runtime
 * because slug resolution reads the static trade index off disk.
 */

import { ImageResponse } from 'next/og';
import { resolveTradeSlug } from '@/lib/trade-slugs';
import { loadTradeFromDisk } from '@/lib/trade-data-server';
import { loadTradeVerdict } from '@/lib/trade-scores-server';
import { tradeVerdictCard, CARD_TEAM_COLORS } from '@/lib/card-templates';
import { buildHeroImages } from '@/lib/hero-images';
import { getAnyTeamDisplayInfo } from '@/lib/teams';

export const runtime = 'nodejs';

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const resolved = await resolveTradeSlug(slug, 'NBA');
  if (!resolved) return new Response('Not found', { status: 404 });

  const trade = await loadTradeFromDisk(resolved.id, 'NBA');
  if (!trade) return new Response('Not found', { status: 404 });

  const verdict = await loadTradeVerdict(resolved.id);

  // ── Rich verdict card ────────────────────────────────────────
  if (verdict && Object.keys(verdict.teamScores).length > 0) {
    const base = {
      date: trade.date,
      league: 'NBA',
      teamScores: verdict.teamScores,
      winner: verdict.winner,
      lopsidedness: verdict.lopsidedness,
      format: 'og' as const,
    };

    try {
      const { primary: heroImages } = buildHeroImages(verdict.teamScores);
      return new ImageResponse(tradeVerdictCard({ ...base, heroImages }), {
        width: WIDTH,
        height: HEIGHT,
        headers: { 'Cache-Control': 'public, max-age=86400' },
      });
    } catch {
      // Headshot fetch failed — render the same card without hero images.
      try {
        return new ImageResponse(tradeVerdictCard(base), {
          width: WIDTH,
          height: HEIGHT,
          headers: { 'Cache-Control': 'public, max-age=3600' },
        });
      } catch {
        // Fall through to the title card.
      }
    }
  }

  // ── Fallback: title card ─────────────────────────────────────
  const colors = trade.teams
    .map((t) => CARD_TEAM_COLORS[t.team_id])
    .filter(Boolean)
    .slice(0, 2);
  const leftColor = colors[0] || '#ff6b35';
  const rightColor = colors[1] || colors[0] || '#4ecdc4';

  const title = trade.title.replace(/\s+Trade$/i, '');
  const teamLine = trade.teams
    .map((t) => getAnyTeamDisplayInfo(t.team_id, trade.date).name)
    .join('  ·  ');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0a0f',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', height: 8 }}>
          <div style={{ flex: 1, backgroundColor: leftColor }} />
          <div style={{ flex: 1, backgroundColor: rightColor }} />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '0 72px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 4,
              color: '#8a8a9f',
              textTransform: 'uppercase',
            }}
          >
            {trade.date} · {trade.season}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 48 ? 58 : 72,
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.05,
              marginTop: 18,
            }}
          >
            {title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: '#b0b0c0',
              marginTop: 24,
            }}
          >
            {teamLine}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 72px 44px',
            fontSize: 26,
            letterSpacing: 3,
            color: '#ff6b35',
            fontWeight: 700,
          }}
        >
          NBA TRADE MAPPER
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    },
  );
}
