import { notFound } from 'next/navigation';
import { AskTheJudge } from '@/components/AskTheJudge';

/**
 * Judge conversation harness (gated by MOBILE_HARNESS=1). Renders the EXACT
 * AskTheJudge client component so Playwright can drive real multi-turn
 * conversations — chips, removals, persistence — deterministically, with the
 * network mocked at the page level. The server-side merge logic is covered by
 * the frozen multi-turn corpus and live production checks; what is measured
 * here is what the browser actually does. It is a 404 in any normal build —
 * no auth is bypassed because no user data is served.
 */
export const dynamic = 'force-dynamic';

export default function JudgeHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-lg font-bold text-white">Judge harness</h1>
      <AskTheJudge />
    </main>
  );
}
