import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/share/'],
        disallow: ['/app', '/api/', '/auth/', '/onboarding'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
