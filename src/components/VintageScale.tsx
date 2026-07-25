/**
 * Vintage Mode used to switch the WHOLE app into "Simple view" and persist
 * `wv_simple` in localStorage — which is why every later visit reopened in
 * Simple View. Simple View is removed; the full result experience is the only
 * view. This component now actively CLEARS the legacy flag so anyone who
 * visited Vintage Mode before is migrated back to the full view.
 */
'use client';

import { useEffect } from 'react';

export function VintageScale() {
  useEffect(() => {
    document.documentElement.removeAttribute('data-simple');
    try {
      localStorage.removeItem('wv_simple');
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
