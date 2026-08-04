'use client';

import { useEffect } from 'react';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * Fires only when the ROOT layout itself throws — deliberately minimal
 * (no shared providers, no globals.css dependency) since the layout that
 * would normally supply those is the thing that just failed. Same
 * bounded-fields-only report as error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportReliabilityEvent('js_error', {
      route: typeof window !== 'undefined' ? window.location.pathname.slice(0, 80) : null,
      name: error.name.slice(0, 80),
      digest: error.digest?.slice(0, 80) ?? null,
      root: true,
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100dvh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem', textAlign: 'center', background: '#0a0a0f', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ maxWidth: '24rem', fontSize: '0.875rem', color: '#94a3b8' }}>
          The app hit an unexpected error loading this page. It’s been noted.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{ marginTop: '0.5rem', borderRadius: '0.5rem', padding: '0.5rem 1.25rem', fontWeight: 600, background: '#6366f1', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
