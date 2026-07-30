import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FinderUI } from '@/components/FinderUI';
import { ReleaseWall } from '@/components/ReleaseWall';

/**
 * FINDER + RELEASES control harness (gated by MOBILE_HARNESS=1) — renders the
 * REAL FinderUI and ReleaseWall outside the auth wall so the Playwright control
 * suite can click every filter, intercept /api/finder and /api/releases, and
 * prove the full interaction → state → request → validated render loop
 * (staleness banner, Update results, latest-request-wins, diagnostic empty
 * states). A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const SERVICES = [
  { id: 8, name: 'Netflix', emoji: '🅽' },
  { id: 9, name: 'Prime Video', emoji: '🅿' },
  { id: 337, name: 'Disney+', emoji: '🅳' },
  { id: 15, name: 'Hulu', emoji: '🅷' },
];

export default function FinderControlHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page space-y-10 py-6" data-testid="finder-harness">
      <section data-testid="harness-finder">
        <h1 className="mb-4 text-xl font-black text-white">Control harness — Finder</h1>
        <Suspense>
          <FinderUI hasServices watchers={[{ name: 'Amy', love: ['thrillers'], avoid: ['horror'] }]} />
        </Suspense>
      </section>
      <section data-testid="harness-releases">
        <h2 className="mb-4 text-xl font-black text-white">Control harness — New Releases wall</h2>
        <ReleaseWall services={SERVICES} myServiceIds={[8]} />
      </section>
    </main>
  );
}
