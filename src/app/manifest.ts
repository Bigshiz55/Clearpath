import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WatchVerdict',
    short_name: 'WatchVerdict',
    description: 'Personalized movie & TV verdicts — should you watch it?',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#07090f',
    theme_color: '#0b0e17',
    orientation: 'portrait',
    categories: ['entertainment', 'lifestyle'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
