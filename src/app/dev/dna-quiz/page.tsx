import { notFound } from 'next/navigation';
import { DnaQuizHarness } from './DnaQuizHarness';

/**
 * DNA quiz harness (gated by MOBILE_HARNESS=1). Renders the real DnaQuiz client
 * component with a fixed mock title pool + a mock write path, so Playwright can
 * verify the two-step flow, states, Undo, duplicate-tap safety, missing posters,
 * and mobile widths without a live Supabase session. 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function DnaQuizHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  // The harness renders its own full app-shell facsimile (header + nav row +
  // fixed bottom nav), so no extra wrapper here.
  return <DnaQuizHarness />;
}
