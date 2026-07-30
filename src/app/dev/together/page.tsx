import { notFound } from 'next/navigation';
import { StartLiveCourt } from '@/components/StartLiveCourt';
import { CourtSecondaryActions } from '@/components/court/CourtSecondaryActions';

/** The Verdict Room landing harness (gated by MOBILE_HARNESS=1) — the exact
 *  layout of /app/together without a session, so Playwright can assert the
 *  entry hierarchy (one primary CTA, two secondary cards, centered column) at
 *  every width. 404 in any normal build. */
export const dynamic = 'force-dynamic';

export default function TogetherHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page py-6" data-testid="together-harness">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">The Verdict Room</h1>
        <p className="mt-1.5 text-sm text-slate-400">Everyone weighs in. One title wins.</p>
        <div className="mt-6">
          <StartLiveCourt />
        </div>
        <CourtSecondaryActions />
      </div>
    </main>
  );
}
