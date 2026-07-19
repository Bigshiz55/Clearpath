import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  // `share_target` follows the Web Share Target spec (params as an object).
  // Next's Manifest type models params as an array, so we cast past it.
  return {
    name: 'WatchVrdikt',
    short_name: 'WatchVrdikt',
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
    // Android: appear in the system Share sheet; shared text/URL lands on /app/share-target.
    share_target: {
      action: '/app/share-target',
      method: 'get',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  } as unknown as MetadataRoute.Manifest;
}
