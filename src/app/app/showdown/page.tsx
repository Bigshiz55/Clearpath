import type { Metadata } from 'next';
import { Showdown } from '@/components/showdown/Showdown';

/**
 * DNA SHOWDOWN — the calibration game.
 *
 * Lives under `/app` so it inherits the same session handling as every other
 * signed-in surface; the game itself works for an anonymous guest too, because
 * everything it learns is held in the browser's Taste DNA store until there is
 * an account to attach it to.
 *
 * `noindex`: a calibration flow is not a search result.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'DNA Showdown · WatchVerd1ct',
  robots: { index: false, follow: false, nocache: true },
};

export default function ShowdownPage() {
  return (
    <main className="min-h-screen bg-cinema-radial">
      <Showdown />
    </main>
  );
}
