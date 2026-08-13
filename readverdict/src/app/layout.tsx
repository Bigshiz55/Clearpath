import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/nav/AppShell';
import { StoreProvider } from '@/lib/store/StoreProvider';
import { siteUrl } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'ReadVerdict — the right book, not more books',
    template: '%s · ReadVerdict',
  },
  description:
    'ReadVerdict is an intelligent book-recommendation decision service. Tell it what you want, and it gives you the right book — with a clear verdict and why.',
  applicationName: 'ReadVerdict',
  openGraph: {
    title: 'ReadVerdict',
    description: 'The right book, not more books.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d0d10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
