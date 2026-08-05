'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * COMPACT STALENESS WARNING + SELF-HEAL KICK.
 *
 * Shown when the pack page's server render found the listings coverage stale
 * (see coverageIsStale in src/lib/tv/health.ts). Instead of pretending the
 * pack has no content, it says the data is stale — and quietly asks the
 * server to refresh via POST /api/tv/refresh, which is safe to call from
 * here because every gate lives server-side (TVmaze once/day, TV Media once
 * per 2h, budget caps). One kick per mount; if the refresh actually ran,
 * the page re-renders itself with the new data.
 */
export function StaleDataNotice({ coverageEndUtc }: { coverageEndUtc: string | null }) {
  const router = useRouter();
  const kicked = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    setRefreshing(true);
    fetch('/api/tv/refresh', { method: 'POST' })
      .then(async (r) => {
        const body = (await r.json().catch(() => null)) as
          | { tvmaze?: { ran?: boolean }; tvmedia?: { ran?: boolean } }
          | null;
        // Only reload the page when something actually ran — a gated no-op
        // changes nothing and a reload loop would be worse than staleness.
        if (body?.tvmaze?.ran || body?.tvmedia?.ran) router.refresh();
      })
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [router]);

  const ended = coverageEndUtc
    ? new Date(coverageEndUtc).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;

  return (
    <div
      data-testid="pack-stale-notice"
      className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-3 text-sm text-amber-200"
    >
      Listings data is stale{ended ? ` — coverage ends ${ended}` : ''}. What’s shown below is real but may be behind.
      {refreshing ? ' Refreshing now…' : ' A refresh has been requested.'}
    </div>
  );
}
