import type { Metadata } from 'next';
import { Showdown } from '@/components/showdown/Showdown';
import { buildShowdownPool } from '@/lib/showdown/pool';

/**
 * DNA SHOWDOWN — the canonical calibration experience.
 *
 * Replaces the title-grid quiz that used to live at `/app/taste-quiz`, which now
 * redirects here. Two independently evolving calibration flows is how the
 * previous pair (`/app/quiz` and `/app/taste-quiz`) drifted apart, and one of
 * them had to be retired to a redirect stub; this does not repeat that.
 *
 * Under `/app`, so `src/middleware.ts` has already refreshed and gated the
 * session. `noindex`: a calibration flow is not a search result.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'DNA Showdown · WatchVerd1ct',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ShowdownPage() {
  const { titles, withoutDimensions } = await buildShowdownPool();

  // A thin pool is a real state, and the honest thing is to say so rather than
  // deal a game out of two titles. Fingerprints are populated in batch, so this
  // resolves itself as the cache fills — it is not an error.
  if (titles.length < 4) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center gap-4 px-5">
        <h1 className="text-2xl font-black text-white">Not enough to compare yet</h1>
        <p className="text-sm text-slate-400" data-testid="showdown-thin-pool">
          We only have {titles.length} titles with a content fingerprint right now
          {withoutDimensions > 0 ? `, and ${withoutDimensions} still waiting to be classified` : ''}. The
          Showdown compares titles axis by axis, so it needs those before it can ask a fair question.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-cinema-radial">
      <Showdown pool={titles} />
    </main>
  );
}
