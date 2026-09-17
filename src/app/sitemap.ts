import type { MetadataRoute } from 'next';
import { EXPLORE_SLUGS } from '@/lib/discovery/slugs';
import { allTradeSlugs } from '@/lib/trade-slugs';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/trade-machine`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/assets`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/methodology`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/team`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const explorePages: MetadataRoute.Sitemap = EXPLORE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/explore/${slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const slugs = await allTradeSlugs('NBA');
  const tradePages: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${SITE_URL}/trade/${slug}`,
    changeFrequency: 'yearly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...explorePages, ...tradePages];
}
