import { notFound } from 'next/navigation';
import { DnaQuizHarness } from './DnaQuizHarness';

/**
 * DNA quiz harness (gated by MOBILE_HARNESS=1). Renders the real DnaQuiz client
 * component full-screen with a fixed mock title pool + a mock write path, so
 * Playwright can verify the single-screen layout (poster + title + all four
 * response buttons visible, no scroll, no layout shift), states, Undo,
 * duplicate-tap safety, missing posters, and every iPhone width — without a live
 * Supabase session. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function DnaQuizHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  // Full small-viewport height, no padding — the component owns the screen, so a
  // scroll or a clipped control is a real, catchable regression.
  return (
    <div className="h-[100svh] overflow-hidden">
      <DnaQuizHarness />
    </div>
  );
}
