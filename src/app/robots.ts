import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        // Public discovery platform is crawlable; the product, admin CMS,
        // internal harnesses and private routes are not.
        allow: ['/', '/share/', '/compare/', '/for/', '/guides/', '/discover/', '/explore'],
        disallow: ['/app', '/api/', '/auth/', '/onboarding', '/admin', '/dev/', '/migrate', '/growth-os', '/os'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
