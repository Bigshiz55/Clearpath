import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TonightMachine } from '@/components/tonight/TonightMachine';
import { tonightMachineEnabled } from '@/lib/tonight/flag';

/**
 * THE TONIGHT MACHINE — the customer route.
 *
 * Sits under `/app`, so `src/middleware.ts` has already refreshed the session
 * and gated it; there is no second auth check to get subtly wrong here.
 *
 * Dark until `TONIGHT_MACHINE` is set. `notFound()` rather than a redirect,
 * because a redirect to the old flow would tell anyone who guessed the URL that
 * the feature exists and is merely switched off — and because a 404 is the
 * honest answer for a route that is not part of the product yet.
 *
 * `force-dynamic` is what makes the flag a real switch: the gate is evaluated
 * per request, so turning the feature off never waits on a rebuild.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tonight · WatchVerd1ct' };

export default function TonightPage() {
  if (!tonightMachineEnabled()) notFound();
  return (
    <main className="min-h-screen bg-cinema-radial">
      <TonightMachine />
    </main>
  );
}
