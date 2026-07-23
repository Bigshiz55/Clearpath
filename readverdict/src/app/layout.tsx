import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { siteUrl } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'ReadVerdict — should you read it?',
    template: '%s · ReadVerdict',
  },
  description:
    'Search any book and get a clear ReadVerdict: a transparent 0–100 score, honest signals, and where to read it. Powered by Open Library.',
  applicationName: 'ReadVerdict',
  openGraph: {
    title: 'ReadVerdict — should you read it?',
    description:
      'A transparent, deterministic verdict for any book. Powered by Open Library.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#14110b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-ink-800/70">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-500 text-ink-950">
                <BookGlyph />
              </span>
              <span className="text-lg tracking-tight">
                Read<span className="text-accent-400">Verdict</span>
              </span>
            </Link>
            <Link href="/search" className="text-sm text-paper-200 hover:text-paper-50">
              Search
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-ink-800/70">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-ink-500">
            <p>
              Book data from{' '}
              <a
                href="https://openlibrary.org"
                className="link-quiet"
                target="_blank"
                rel="noreferrer"
              >
                Open Library
              </a>
              . Ratings, availability, and counts are shown as reported — never
              fabricated. Missing data is labelled unavailable.
            </p>
            <p className="mt-1">
              The ReadVerdict Score is computed by a transparent, deterministic
              engine.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function BookGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5c2.6-1.1 5.4-1.1 8 0v13c-2.6-1.1-5.4-1.1-8 0v-13z"
        fill="currentColor"
        opacity="0.85"
      />
      <path
        d="M20 5.5c-2.6-1.1-5.4-1.1-8 0v13c2.6-1.1 5.4-1.1 8 0v-13z"
        fill="currentColor"
      />
    </svg>
  );
}
