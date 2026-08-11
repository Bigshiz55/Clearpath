'use client';

/**
 * Dev-harness sink: makes the event stream observable in a browser.
 *
 * Unit tests prove the event builders are correct, which is not the same claim
 * as "the component actually emits them" — the wiring is the part that silently
 * rots. This installs a sink that appends to `window.__tonightEvents` so a
 * browser test can assert on the real stream a real session produces.
 *
 * Rendered only by `/dev/tonight`, which 404s in production, so this never
 * reaches a customer and never becomes a second, accidental analytics path.
 */

import { useEffect } from 'react';
import { setTonightSink, type TonightEvent } from '@/lib/tonight/analytics';

declare global {
  interface Window {
    __tonightEvents?: TonightEvent[];
  }
}

export function TonightDevEvents() {
  useEffect(() => {
    window.__tonightEvents = [];
    setTonightSink((event) => {
      window.__tonightEvents?.push(event);
    });
    return () => setTonightSink(null);
  }, []);

  return null;
}
