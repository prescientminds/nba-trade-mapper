/**
 * Server-side trade verdict lookup.
 *
 * Mirrors what `/api/card-data/[tradeId]` serves to the client, minus the hero
 * image proxying. Returns null on any failure so callers can render the trade
 * without a verdict rather than failing the page.
 */

import { createClient } from '@supabase/supabase-js';
import type { AssetScore, TeamScoreEntry } from './card-templates';

export interface TradeVerdict {
  teamScores: Record<string, TeamScoreEntry>;
  winner: string | null;
  lopsidedness: number;
}

export async function loadTradeVerdict(
  tradeId: string,
): Promise<TradeVerdict | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from('trade_scores')
      .select('team_scores, winner, lopsidedness')
      .eq('trade_id', tradeId)
      .single();

    if (error || !data) return null;

    return {
      teamScores: (data.team_scores ?? {}) as Record<string, TeamScoreEntry>,
      winner: (data.winner ?? null) as string | null,
      lopsidedness: Number(data.lopsidedness ?? 0),
    };
  } catch {
    return null;
  }
}

/** Highest-scoring assets across the whole trade, for the page description. */
export function topAssets(verdict: TradeVerdict | null, limit = 2): AssetScore[] {
  if (!verdict) return [];
  const all: AssetScore[] = [];
  for (const entry of Object.values(verdict.teamScores)) {
    all.push(...(entry.assets ?? []));
  }
  return all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}
