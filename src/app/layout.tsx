import type { Metadata, Viewport } from 'next';
import './globals.css';
import { publicEnv } from '@/lib/env';
import { ToastProvider } from '@/components/Toast';
import { ServiceWorker } from '@/components/ServiceWorker';
import { DesktopViewExit } from '@/components/DesktopViewExit';

const siteUrl = publicEnv.siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'WatchVrdIQt — Should you watch it?',
    template: '%s · WatchVrdIQt',
  },
  description:
    'Personalized movie & TV verdicts. Get a clear recommendation, a match score tuned to your taste, and where to watch it legally.',
  applicationName: 'WatchVrdIQt',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WatchVrdIQt',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'WatchVrdIQt',
    title: 'WatchVrdIQt — Should you watch it?',
    description: 'Personalized movie & TV verdicts with a match score tuned to your taste.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WatchVrdIQt',
    description: 'Personalized movie & TV verdicts.',
  },
};

// Only themeColor here — the viewport meta is rendered manually below so the
// "Desktop view" toggle can rewrite its width at runtime (single controlled tag).
export const viewport: Viewport = {
  themeColor: '#0b0e17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The single, runtime-controlled viewport meta — the Desktop view toggle
            rewrites its width. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Apply Simple (Senior) view + Desktop-view preference before paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('wv_simple')==='1')document.documentElement.setAttribute('data-simple','1');if(localStorage.getItem('wv_view')==='desktop'){var m=document.querySelector('meta[name=viewport]');if(m)m.setAttribute('content','width=1200, viewport-fit=cover');}}catch(e){}",
          }}
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <DesktopViewExit />
        <ServiceWorker />
      </body>
    </html>
  );
}
