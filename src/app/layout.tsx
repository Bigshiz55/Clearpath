import type { Metadata, Viewport } from 'next';
import './globals.css';
import { publicEnv } from '@/lib/env';
import { ToastProvider } from '@/components/Toast';
import { ServiceWorker } from '@/components/ServiceWorker';
import { BuildVersionBadge } from '@/components/BuildVersionBadge';
import { FeedbackButton } from '@/components/FeedbackButton';
import { Footer } from '@/components/Footer';
import { PREHYDRATION_SCRIPT } from '@/lib/search/openRequest';

const siteUrl = publicEnv.siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'WatchVerd1ct — Thousands of titles. One verd1ct.',
    template: '%s · WatchVerd1ct',
  },
  description:
    'Thousands of titles. One verd1ct. Personalized movie & TV recommendations — a clear verdict, a match score tuned to your taste, and where to watch it legally.',
  applicationName: 'WatchVerd1ct',
  manifest: '/manifest.webmanifest',
  // The homepage's own canonical/og:url. Pages below the root set their own
  // `alternates.canonical` / `openGraph.url` (see e.g. src/app/movie/[slug]
  // or src/app/app/title/[type]/[id]) — Next.js deep-merges the `openGraph`
  // object per key, so a page that supplies its own `url` fully replaces
  // this one rather than appending to it. Only a route with no metadata of
  // its own falls back to this homepage value.
  alternates: { canonical: siteUrl },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'WatchVerd1ct',
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
    siteName: 'WatchVerd1ct',
    title: 'WatchVerd1ct — Thousands of titles. One verd1ct.',
    description: 'Thousands of titles. One verd1ct. Personalized movie & TV recommendations with a match score tuned to your taste.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WatchVerd1ct — Thousands of titles. One verd1ct.',
    description: 'Thousands of titles. One verd1ct.',
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
        {/* SIMPLE VIEW IS REMOVED. This script used to restore `wv_simple`
            before paint, which is why returning users kept reopening in Simple
            View. It now performs a ONE-TIME CLEANUP instead — clearing the
            legacy flag from localStorage, sessionStorage and cookies, stripping
            any simple-view URL parameter, and removing the attribute if some
            older cached page set it. The full result view is the only view.
            The Desktop/Phone viewport preference (a separate feature) is
            unaffected. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{['wv_simple','wv_simple_view','simpleView','simple_view','wv_view_mode'].forEach(function(k){localStorage.removeItem(k);sessionStorage.removeItem(k);document.cookie=k+'=; Max-Age=0; path=/';});document.documentElement.removeAttribute('data-simple');var u=new URL(location.href),d=0;['simple','simpleView','simple_view','view','viewMode','cardMode','resultMode'].forEach(function(p){var v=u.searchParams.get(p);if(v!==null&&/^(1|true|simple|compact|minimal)$/i.test(v)){u.searchParams.delete(p);d=1;}});if(d)history.replaceState(null,'',u.toString());if(localStorage.getItem('wv_view')==='desktop'){var m=document.querySelector('meta[name=viewport]');if(m)m.setAttribute('content','width=1200, viewport-fit=cover');}}catch(e){}",
          }}
        />
        {/* SEARCH MUST WORK ON THE FIRST TAP, INCLUDING BEFORE HYDRATION.
            The header's search trigger and the search sheet are separate React
            trees. Until this existed they spoke through a one-shot CustomEvent,
            so on a slow phone a tap could fire before the sheet was listening
            and be lost — the button looked dead. This records the tap in the
            DOM itself, before any bundle has run, and the sheet claims it on
            mount. See src/lib/search/openRequest.ts. */}
        <script dangerouslySetInnerHTML={{ __html: PREHYDRATION_SCRIPT }} />
      </head>
      <body>
        <BuildVersionBadge />
        <ToastProvider>{children}</ToastProvider>
        <Footer />
        <ServiceWorker />
        <FeedbackButton />
      </body>
    </html>
  );
}
