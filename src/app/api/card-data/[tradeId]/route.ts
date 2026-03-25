// Returns trade score data + hero image proxy URLs for client-side card rendering.
import { createClient } from '@supabase/supabase-js';
import { buildHeroImages } from '@/lib/hero-images';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params;
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) {
    return Response.json({ error: 'Server config error' }, { status: 500 });
  }

  const sb = createClient(sbUrl, sbKey);
  const { data, error } = await sb
    .from('trade_scores')
    .select('team_scores, winner, lopsidedness, salary_details')
    .eq('trade_id', tradeId)
    .single();

  if (error || !data) {
    return Response.json({ error: 'Trade not found' }, { status: 404 });
  }

  // Build hero URLs as proxy paths (client will fetch these to get data URLs)
  const rawHeroes = buildHeroImages(data.team_scores, 3);
  const heroUrls: Record<string, string[]> = {};
  const fallbackHeroUrls: Record<string, string[]> = {};
  for (const [teamId, urls] of Object.entries(rawHeroes.primary)) {
    heroUrls[teamId] = urls.map(u => `/api/img?url=${encodeURIComponent(u)}`);
  }
  for (const [teamId, urls] of Object.entries(rawHeroes.fallback)) {
    fallbackHeroUrls[teamId] = urls
      .map(u => u ? `/api/img?url=${encodeURIComponent(u)}` : '');
  }

  return Response.json({
    teamScores: data.team_scores,
    winner: data.winner,
    lopsidedness: data.lopsidedness,
    salaryDetails: data.salary_details,
    heroUrls,
    fallbackHeroUrls,
  }, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
