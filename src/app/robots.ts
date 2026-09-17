import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Preview and internal render surfaces carry no standalone content.
        disallow: ['/api/', '/card-preview', '/trade-machine/node-preview', '/trade-machine/flow-preview', '/trade-machine/visualize-preview'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
