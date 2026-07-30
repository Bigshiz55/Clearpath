import { notFound } from 'next/navigation';
import { CourtIntro } from '@/components/court/CourtIntro';
import { TogetherSecondary } from '@/components/TogetherSecondary';

/** Tonight-Together harness (gated by MOBILE_HARNESS=1) — the exact layout of
 *  /app/together without a session, so Playwright can assert the single-entry
 *  hierarchy (one filled button, secondary links, centered column) at every
 *  width. 404 in any normal build. */
export const dynamic = 'force-dynamic';

export default function TogetherHarnessPage() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page py-6" data-testid="together-harness">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Tonight, Together</h1>
        <p className="mt-2 text-sm text-slate-400">
          One pick the whole room will actually agree on — never suggesting something on someone’s
          hard-no list.
        </p>
        <div className="mt-5">
          <CourtIntro big />
        </div>
        <TogetherSecondary />
      </div>
    </main>
  );
}
