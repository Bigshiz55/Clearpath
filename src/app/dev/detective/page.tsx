import { notFound } from 'next/navigation';
import { TvDetective } from '@/components/TvDetective';

/**
 * TV GUIDE DETECTIVE harness (MOBILE_HARNESS=1).
 *
 * The detective lives at `/app/tv`, behind a session, and fills itself from
 * `/api/detective` — so its case-file rows had never been measured at a phone
 * width. That is how REMIND · SAVE · FOR · AGAINST came to print two labels on
 * top of each other on an iPhone: the row is a grid area, and nothing was
 * asserting what happened inside it.
 *
 * The suite stubs `/api/detective`, so no schedule provider is contacted.
 * A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

export default function DetectiveHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page py-6" data-testid="detective-harness">
      <h1 className="mb-4 text-xl font-black text-white">TV Guide Detective — case file rows</h1>
      <TvDetective />
    </main>
  );
}
