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
    default: 'WatchVerdict — Thousands of choices, one verdict',
    template: '%s · WatchVerdict',
  },
  description:
    'Thousands of choices, one verdict. Personalized movie & TV recommendations — a clear verdict, a match score tuned to your taste, and where to watch it legally.',
  applicationName: 'WatchVerdict',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WatchVerdict',
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
    siteName: 'WatchVerdict',
    title: 'WatchVerdict — Thousands of choices, one verdict',
    description: 'Thousands of choices, one verdict — personalized movie & TV recommendations with a match score tuned to your taste.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WatchVerdict — Thousands of choices, one verdict',
    description: 'Thousands of choices, one verdict.',
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
