import type { Metadata } from 'next';
import { Showdown } from '@/components/showdown/Showdown';

/**
 * PICK FOR TONIGHT — the same game, the other ledger.
 *
 * Identical surface to `/app/showdown`: same posters, same four controls, same
 * planner, same 160ms advance. The only difference is the question it asks and
 * where the answer goes — this run produces SessionContextEvidence, bends
 * tonight's ranking, and leaves permanent Taste DNA untouched.
 *
 * A separate route rather than a toggle because the two are different
 * intentions, and a person arriving to pick a film tonight should not have to
 * notice a mode switch to avoid rewriting their own profile.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pick for tonight · WatchVerd1ct',
  robots: { index: false, follow: false, nocache: true },
};

export default function TonightPage() {
  return (
    <main className="min-h-screen bg-cinema-radial">
      <Showdown mode="tonight" />
    </main>
  );
}
