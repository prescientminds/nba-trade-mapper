// Standalone Trade Verdict card image endpoint.
// GET /api/card/trade/{tradeId}?date=2012-10-27&league=NBA&format=og|square|story
//   &accolades=true&winShares=false&championships=false&playoffWs=false&seasons=false&detailedVerdict=false
//
// Returns a PNG image. Used by:
//   - Direct testing (visit URL in browser)
//   - Share composer modal (preview + download)

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { tradeVerdictCard, type TeamScoreEntry } from '@/lib/card-templates';
import { NBA_PLAYER_IDS } from '@/lib/nba-player-ids';

export const runtime = 'edge';

const DIMS: Record<string, { width: number; height: number }> = {
  og:     { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story:  { width: 1080, height: 1920 },
};

const NBA_HEADSHOT = (id: number) =>
  `https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`;

/** Find the top-scoring player per team and return their headshot URL if available. */
function buildHeroImages(
  teamScores: Record<string, TeamScoreEntry>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [teamId, ts] of Object.entries(teamScores)) {
    if (!ts.assets.length) continue;
    const top = ts.assets.reduce((a, b) => (b.score > a.score ? b : a));
    const nbaId = NBA_PLAYER_IDS[top.name];
    if (nbaId) {
      result[teamId] = NBA_HEADSHOT(nbaId);
    }
  }
  return result;
}

function parseBool(val: string | null, fallback: boolean): boolean {
  if (val === null) return fallback;
  return val === 'true';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params;
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const league = url.searchParams.get('league') || 'NBA';
  const format = (url.searchParams.get('format') || 'og') as 'og' | 'square' | 'story';

  // Spotlight toggles
  const spotlight = {
    accolades: parseBool(url.searchParams.get('accolades'), true),
    winShares: parseBool(url.searchParams.get('winShares'), false),
    championships: parseBool(url.searchParams.get('championships'), false),
    playoffWs: parseBool(url.searchParams.get('playoffWs'), false),
    seasons: parseBool(url.searchParams.get('seasons'), false),
    detailedVerdict: parseBool(url.searchParams.get('detailedVerdict'), false),
  };

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) {
    return new Response('Server config error', { status: 500 });
  }

  const sb = createClient(sbUrl, sbKey);
  const { data, error } = await sb
    .from('trade_scores')
    .select('team_scores, winner, lopsidedness')
    .eq('trade_id', tradeId)
    .single();

  if (error || !data) {
    return new Response(`Trade not found: ${tradeId}`, { status: 404 });
  }

  const dims = DIMS[format] || DIMS.og;
  const heroImages = buildHeroImages(data.team_scores);

  return new ImageResponse(
    tradeVerdictCard({
      date,
      league,
      teamScores: data.team_scores,
      winner: data.winner,
      lopsidedness: data.lopsidedness,
      heroImages,
      format,
      spotlight,
    }),
    {
      ...dims,
      headers: { 'Cache-Control': 'public, max-age=86400' },
    },
  );
}
