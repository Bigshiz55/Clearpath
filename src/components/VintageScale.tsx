'use client';

import { useEffect } from 'react';

/**
 * Entering Vintage Mode turns on the big, high-contrast "Simple view" for the
 * whole app — so everything a senior taps into (the Taste Game, On TV, their
 * reminders) stays big too, not just this page. They can switch it off with the
 * "A" toggle in the header any time.
 */
export function VintageScale() {
  useEffect(() => {
    document.documentElement.setAttribute('data-simple', '1');
    try {
      localStorage.setItem('wv_simple', '1');
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
