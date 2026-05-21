// Slug ↔ category-id map for the Explore section.
// Internal category IDs are kept as-is in DiscoverySection.tsx; URL slugs are
// derived from the user-facing label. Each category gets its own /explore/[slug] page.

export type ExploreCategoryId =
  | 'trade-tree'
  | 'trade-down'
  | 'verdict-flips'
  | 'alchemists'
  | 'heist'
  | 'champ-dna'
  | 'blockbusters'
  | 'journeymen'
  | 'championship-road';

const SLUG_TO_ID: Record<string, ExploreCategoryId> = {
  'value-creation': 'trade-tree',
  'trade-down-ledger': 'trade-down',
  'verdict-flips': 'verdict-flips',
  'alchemists': 'alchemists',
  'heist-index': 'heist',
  'championship-dna': 'champ-dna',
  'blockbusters': 'blockbusters',
  'journeymen': 'journeymen',
  'road-to-a-championship': 'championship-road',
};

const ID_TO_SLUG: Record<ExploreCategoryId, string> = Object.fromEntries(
  Object.entries(SLUG_TO_ID).map(([slug, id]) => [id, slug])
) as Record<ExploreCategoryId, string>;

// Display titles, keyed by slug — used for page headers and OG metadata.
// (Category labels in DiscoverySection are league-aware for "journeymen";
// these are the canonical share titles.)
const SLUG_TO_TITLE: Record<string, string> = {
  'value-creation': 'Value Creation',
  'trade-down-ledger': 'The Trade-Down Ledger',
  'verdict-flips': 'Verdict Flips',
  'alchemists': 'The Alchemists',
  'heist-index': 'Heist Index',
  'championship-dna': 'Championship DNA',
  'blockbusters': 'Blockbusters',
  'journeymen': 'The Journeymen',
  'road-to-a-championship': 'Road to a Championship',
};

export function slugToCategoryId(slug: string): ExploreCategoryId | null {
  return SLUG_TO_ID[slug] ?? null;
}

export function slugToTitle(slug: string): string | null {
  return SLUG_TO_TITLE[slug] ?? null;
}

export function categoryIdToSlug(id: string): string | null {
  return ID_TO_SLUG[id as ExploreCategoryId] ?? null;
}

export const EXPLORE_SLUGS = Object.keys(SLUG_TO_ID);
