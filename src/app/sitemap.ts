import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl();
  return [
    { url: `${base}/`, priority: 1 },
    { url: `${base}/login`, priority: 0.5 },
  ];
}
