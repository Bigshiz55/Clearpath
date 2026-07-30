import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';
import { publishedEntries } from '@/lib/discovery/registry';
import { titlePages } from '@/lib/discovery/titlePages';

/**
 * The sitemap is generated from the page registry and contains ONLY pages that
 * pass the quality gate AND are marked published AND whose publish date has
 * arrived. Drafts, needs-review, noindex and retired pages can never leak in,
 * because this list is derived from the same `isPublishable` decision the
 * routes use for their robots directives.
 */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl();
  const core: MetadataRoute.Sitemap = [
    { url: `${base}/`, priority: 1, changeFrequency: 'weekly' },
    { url: `${base}/explore`, priority: 0.9, changeFrequency: 'weekly' },
    { url: `${base}/login`, priority: 0.3 },
  ];
  const pages: MetadataRoute.Sitemap = publishedEntries(new Date(), titlePages()).map((e) => ({
    url: `${base}${e.path}`,
    lastModified: new Date(e.page.updated),
    changeFrequency: 'monthly' as const,
    priority: e.page.kind === 'compare' || e.page.kind === 'for' ? 0.8 : 0.7,
  }));
  return [...core, ...pages];
}
