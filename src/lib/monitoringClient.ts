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
/**
 * ONE BEACON PER DISTINCT EVENT PER PAGE, NOT ONE PER CARD.
 *
 * A grid of twenty posters whose availability lookups all fail is ONE outage,
 * not twenty. Without this, that single failure fired twenty identical
 * beacons — pointless duplicate rows for an operator, and real extra request
 * volume at exactly the moment the network is already struggling. It also
 * meant a page full of failing cards could keep the connection busy long
 * enough to matter (the /dev/feed harness stopped reaching `networkidle`,
 * which is how this was noticed).
 *
 * Keyed on name + props so genuinely different failures still each report.
 * Per page load: a reload is a new incident and reports again.
 */
const sent = new Set<string>();

export function reportReliabilityEvent(name: ReliabilityEventName, props: ReliabilityEventProps = {}): void {
  try {
    const payload = JSON.stringify({ name, props });
    if (sent.has(payload)) return;
    sent.add(payload);
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
