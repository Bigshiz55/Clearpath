import type { Metadata } from 'next';
import { StartLiveCourt } from '@/components/StartLiveCourt';
import { CourtSecondaryActions } from '@/components/court/CourtSecondaryActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'The Verdict Room · WatchVerd1ct',
};

/**
 * THE VERDICT ROOM — one obvious primary action, two clear secondary cards.
 * The rest of the page (Cloud Crews) stays reachable but demoted to a small
 * link under the cards, so it doesn't compete with the main entry.
 */
export default async function TogetherPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">The Verdict Room</h1>
      <p className="mt-1.5 text-sm text-slate-400">Everyone weighs in. One title wins.</p>

      <div className="mt-6">
        <StartLiveCourt />
      </div>

      <CourtSecondaryActions />
    </div>
  );
}
