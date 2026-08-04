'use client';

import type { ReliabilityEventName, ReliabilityEventProps } from '@/lib/monitoring';

/**
 * Client-side counterpart to recordReliabilityEvent — for the handful of
 * reliability events that only exist in the browser (see api/monitor's
 * doc comment). `sendBeacon` survives the page unloading (the exact moment
 * a JS-error report is most likely to fire); fetch+keepalive is the
 * fallback where sendBeacon isn't available. Never throws, never awaited
 * by the caller — a monitoring call must never block or fail the action
 * that triggered it.
 */
export function reportReliabilityEvent(name: ReliabilityEventName, props: ReliabilityEventProps = {}): void {
  try {
    const payload = JSON.stringify({ name, props });
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/monitor', blob);
      return;
    }
    void fetch('/api/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
