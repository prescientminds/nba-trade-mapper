/** Canonical origin. The apex domain 301s to www, so www is the indexable host. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://www.nbatrademapper.com';
