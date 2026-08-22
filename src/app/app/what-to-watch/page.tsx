import { WatchNowList } from '@/components/tv/WatchNowList';
import { queryWatchNow } from '@/lib/tv/platform/query';
import { dataModeReport } from '@/lib/tv/dataMode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'What to Watch — WatchVerd1ct' };

/**
 * WHAT TO WATCH — one screen, both pipelines.
 *
 * Streaming availability and live TV in a single list, because "what can I
 * watch" is one question. The split into "On TV" and "Where to Watch" was an
 * artefact of having two ingestion paths, and users do not have two paths.
 *
 * SERVER-RENDERED, ZERO UPSTREAM REQUESTS. The read is a database/fixture
 * read; nothing here reaches a provider, which is the specification's "a
 * normal user session generates zero direct requests to schedule pages or
 * streaming providers", enforced by the egress guard rather than by care.
 */
export default async function WhatToWatchPage({
  searchParams,
}: {
  searchParams?: { kind?: string; included?: string; services?: string };
}) {
  const kind = searchParams?.kind === 'streaming' || searchParams?.kind === 'linear'
    ? searchParams.kind : 'all';
  const services = searchParams?.services?.split(',').map((s) => s.trim()).filter(Boolean);

  const result = queryWatchNow({
    kind,
    includedOnly: searchParams?.included === '1',
    services: services?.length ? services : undefined,
    limit: 40,
  });
  const mode = dataModeReport();

  const filters: { label: string; href: string; active: boolean }[] = [
    { label: 'Everything', href: '/app/what-to-watch', active: kind === 'all' && searchParams?.included !== '1' },
    { label: 'Streaming', href: '/app/what-to-watch?kind=streaming', active: kind === 'streaming' },
    { label: 'On TV', href: '/app/what-to-watch?kind=linear', active: kind === 'linear' },
    { label: 'No extra cost', href: '/app/what-to-watch?included=1', active: searchParams?.included === '1' },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">What to Watch</h1>
      <p className="mt-1 text-sm text-white/60">
        Streaming and live TV together. Every result says where it came from.
      </p>

      {/* Filters as links, so the page works with JS disabled and every state
          is a real URL somebody can share or bookmark. */}
      <nav aria-label="Filters" className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <a
            key={f.label}
            href={f.href}
            data-testid="wtw-filter"
            aria-current={f.active ? 'page' : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm ${
              f.active ? 'border-amber-400/60 bg-amber-400/15 text-amber-100' : 'border-white/15 bg-white/5 text-white/75'
            }`}
          >
            {f.label}
          </a>
        ))}
      </nav>

      {/* Coverage, stated rather than implied. */}
      <div data-testid="wtw-coverage" className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
        <p>
          {mode.configured
            ? 'Showing verified listings we can confirm.'
            : 'Live listings aren’t set up here yet.'}
        </p>
        {result.coverage.sources.length > 0 ? (
          <p className="mt-1">
            Sources: {result.coverage.sources.map((s) => `${s.slug} (${s.stage})`).join(', ')}
          </p>
        ) : null}
        {result.coverage.filteredOutFixtureInProduction > 0 ? (
          <p className="mt-1">
            {result.coverage.filteredOutFixtureInProduction} generated test row(s) withheld — test data is never shown as real availability.
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <WatchNowList result={result} />
      </div>
    </main>
  );
}
