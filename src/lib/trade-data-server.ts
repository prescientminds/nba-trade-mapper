/**
 * Server-side trade loading.
 *
 * `trade-data.ts` fetches static JSON over relative URLs, which only works in
 * the browser. Server rendering, `generateMetadata`, and the sitemap need the
 * same records off disk instead.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StaticTrade } from './supabase';
import type { League } from './league';
import { getSlugMaps } from './trade-slugs';

const DATA_DIR: Record<League, string> = {
  NBA: 'public/data/trades',
  WNBA: 'public/data/wnba/trades',
};

const seasonCache = new Map<string, StaticTrade[]>();

async function loadSeasonFromDisk(
  season: string,
  league: League,
): Promise<StaticTrade[]> {
  const key = `${league}:${season}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;

  const file = path.join(
    process.cwd(),
    DATA_DIR[league],
    'by-season',
    `${season}.json`,
  );
  try {
    const trades = JSON.parse(await fs.readFile(file, 'utf8')) as StaticTrade[];
    seasonCache.set(key, trades);
    return trades;
  } catch {
    seasonCache.set(key, []);
    return [];
  }
}

/** Full trade record for an id, or null when it is missing from the data. */
export async function loadTradeFromDisk(
  tradeId: string,
  league: League = 'NBA',
): Promise<StaticTrade | null> {
  const { entries } = await getSlugMaps(league);
  const entry = entries.find((e) => e.id === tradeId);
  if (!entry) return null;

  const trades = await loadSeasonFromDisk(entry.season, league);
  return trades.find((t) => t.id === tradeId) ?? null;
}
