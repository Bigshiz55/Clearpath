import type { Metadata } from 'next';
import { HowItWorksTour } from '@/components/onboarding/HowItWorksTour';

export const metadata: Metadata = { title: 'How it works · WatchVerd1ct' };

/**
 * The full walkthrough — reachable any time from the nav's "How it works"
 * entry, or from TourHint's one-time nudge on the home hub. See
 * HowItWorksTour.tsx for why this is opt-in rather than auto-shown.
 */
export default function TourPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-8">
      <HowItWorksTour />
    </div>
  );
}
