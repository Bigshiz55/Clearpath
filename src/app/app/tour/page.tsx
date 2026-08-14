import type { Metadata } from 'next';
import { TourHub } from '@/components/onboarding/TourHub';
import { safeReturnTo } from '@/lib/nav/returnTo';

export const metadata: Metadata = { title: 'How it works · WatchVerd1ct' };

/**
 * The full walkthrough — reachable any time from the nav's "How it works"
 * entry, or from TourHint's one-time nudge on the home hub. See
 * TourHub.tsx for why this is opt-in rather than auto-shown.
 *
 * `returnTo` is where "Done" goes: the page the user entered the tour from,
 * carried as a query param by the nav links and VALIDATED here before
 * anything can navigate to it (same-origin relative path or the /app
 * fallback — see safeReturnTo). Direct access with no param, or a param an
 * attacker wrote, both land on the fallback.
 */
export default function TourPage({
  searchParams,
}: {
  searchParams?: { returnTo?: string };
}) {
  const returnTo = safeReturnTo(searchParams?.returnTo);
  return (
    <div className="flex min-h-[70vh] items-start justify-center py-8">
      <TourHub returnTo={returnTo} />
    </div>
  );
}
