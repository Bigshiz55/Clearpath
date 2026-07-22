'use client';

import { RateNudge } from '@/components/RateNudge';
import type { Tonight } from '@/lib/tonight';

/**
 * The home "what to do next" strip — a gentle nudge to rate recent titles when
 * there are any. (The first-run 30-second welcome tour was removed.)
 */
export function TonightHome({ tonight }: { tonight: Tonight }) {
  if (tonight.unrated.length === 0) return null;
  return (
    <div className="space-y-4">
      <RateNudge items={tonight.unrated} />
    </div>
  );
}
