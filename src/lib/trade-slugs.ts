/**
 * Readable, stable permalink slugs for historical trades.
 *
 * Server-side only — reads the static trade index straight off disk so it
 * works during `generateStaticParams`, `generateMetadata`, and the sitemap,
 * none of which can use the relative-URL `fetch` in `trade-data.ts`.
 *
 * Slug shape:  2012-10-27-james-harden-steven-adams-kevin-martin
 *
 * Six of ~1,963 NBA trades share a base slug (same date, same title). Those
 * get a short id suffix. Collision handling is deterministic and depends only
 * on the trade's own uuid, so a trade's URL never changes when the dataset
 * grows around it.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { League } from './league';

export interface TradeIndexEntry {
  id: string;
  date: string;
  season: string;
  title: string;
  teams: string[];
  players: string[];
  topAssets?: string[];
}

const DATA_DIR: Record<League, string> = {
  NBA: 'public/data/trades',
  WNBA: 'public/data/wnba/trades',
};

const MAX_SLUG_LENGTH = 90;
const ID_SUFFIX_LENGTH = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SlugMaps {
  slugToId: Map<string, string>;
  idToSlug: Map<string, string>;
  entries: TradeIndexEntry[];
}

const mapsCache = new Map<League, Promise<SlugMaps>>();

/** Lowercase, strip accents, collapse everything else to single hyphens. */
export function kebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Date-prefixed base slug, before collision handling. */
export function tradeSlugBase(entry: TradeIndexEntry): string {
  const title = entry.title.replace(/\s+Trade$/i, '');
  const base = `${entry.date}-${kebab(title)}`;
  return base.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, '');
}

export async function loadTradeIndexFromDisk(
  league: League = 'NBA',
): Promise<TradeIndexEntry[]> {
  const file = path.join(process.cwd(), DATA_DIR[league], 'index.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as TradeIndexEntry[];
  } catch {
    return [];
  }
}

export async function getSlugMaps(league: League = 'NBA'): Promise<SlugMaps> {
  const cached = mapsCache.get(league);
  if (cached) return cached;

  const built = (async (): Promise<SlugMaps> => {
    const entries = await loadTradeIndexFromDisk(league);

    // Count base slugs first so we only disambiguate the ones that need it.
    const baseCounts = new Map<string, number>();
    for (const entry of entries) {
      const base = tradeSlugBase(entry);
      baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    }

    const slugToId = new Map<string, string>();
    const idToSlug = new Map<string, string>();

    for (const entry of entries) {
      const base = tradeSlugBase(entry);
      const suffixed = `${base}-${entry.id.slice(0, ID_SUFFIX_LENGTH)}`;
      const canonical = (baseCounts.get(base) ?? 0) > 1 ? suffixed : base;

      idToSlug.set(entry.id, canonical);
      slugToId.set(canonical, entry.id);
      // Always accept the suffixed form as an alias, so a URL minted before a
      // later collision still resolves.
      if (!slugToId.has(suffixed)) slugToId.set(suffixed, entry.id);
    }

    return { slugToId, idToSlug, entries };
  })();

  mapsCache.set(league, built);
  return built;
}

/** Canonical slug for a trade id, or null when the id is unknown. */
export async function slugForTradeId(
  tradeId: string,
  league: League = 'NBA',
): Promise<string | null> {
  const { idToSlug } = await getSlugMaps(league);
  return idToSlug.get(tradeId) ?? null;
}

export interface ResolvedSlug {
  id: string;
  canonicalSlug: string;
  /** True when the incoming slug was an alias or a raw uuid. */
  shouldRedirect: boolean;
}

/** Resolve a URL segment to a trade. Accepts canonical slugs, aliases, uuids. */
export async function resolveTradeSlug(
  slug: string,
  league: League = 'NBA',
): Promise<ResolvedSlug | null> {
  const { slugToId, idToSlug } = await getSlugMaps(league);

  const direct = slugToId.get(slug);
  if (direct) {
    const canonicalSlug = idToSlug.get(direct)!;
    return { id: direct, canonicalSlug, shouldRedirect: canonicalSlug !== slug };
  }

  if (UUID_RE.test(slug)) {
    const canonicalSlug = idToSlug.get(slug);
    if (canonicalSlug) return { id: slug, canonicalSlug, shouldRedirect: true };
  }

  return null;
}

/** Every canonical slug, for `generateStaticParams` and the sitemap. */
export async function allTradeSlugs(league: League = 'NBA'): Promise<string[]> {
  const { idToSlug } = await getSlugMaps(league);
  return [...idToSlug.values()];
}
