import type { Metadata } from 'next';
import { TourHub } from '@/components/onboarding/TourHub';

export const metadata: Metadata = { title: 'How it works · WatchVerd1ct' };

/**
 * The full walkthrough — reachable any time from the nav's "How it works"
 * entry, or from TourHint's one-time nudge on the home hub. See
 * TourHub.tsx for why this is opt-in rather than auto-shown.
 */
export default function TourPage() {
  return (
    <div className="flex min-h-[70vh] items-start justify-center py-8">
      <TourHub />
    </div>
  );
}
