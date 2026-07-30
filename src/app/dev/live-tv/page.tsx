import { notFound } from 'next/navigation';
import { MockScheduleAdapter } from '@/lib/viewing/adapters/mock';
import { resolveSchedule } from '@/lib/viewing/registry';
import { selectAvailable, rankListings, pickTopIndex } from '@/lib/viewing/schedule';
import { buildResultSet, collapseStages } from '@/lib/viewing/contract';
import { LiveScheduleView } from '@/components/tv/LiveScheduleView';
import { providerCapabilities } from '@/lib/viewing/liveTv';
import type { SourceStatus } from '@/lib/viewing/status';

/**
 * LIVE TV HARNESS (MOBILE_HARNESS=1).
 *
 * Runs the REAL pipeline — availability, ranking, recommendation, contract —
 * over the mock national grid, so the whole Live TV experience can be built and
 * verified before TV Media credentials exist. `?status=` forces any provider
 * failure so the honest-status paths are demonstrable too.
 *
 * Never reachable in production, and the mock's provider id (`mock_grid`) is
 * displayed, so these listings can never be mistaken for real ones.
 */
export const dynamic = 'force-dynamic';

const NOW = Date.parse('2026-07-26T20:00:00Z');

export default async function LiveTvHarness({
  searchParams,
}: {
  searchParams: { status?: string; hours?: string; channels?: string };
}) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  const forced = searchParams.status as SourceStatus | undefined;
  const hours = Math.max(1, Math.min(Number(searchParams.hours) || 6, 48));
  const channels = searchParams.channels ? searchParams.channels.split(',') : null;
  const endMs = NOW + hours * 3_600_000;

  const mock = new MockScheduleAdapter(forced ? { forceStatus: forced } : {});
  // The harness registers the mock directly, so it works without MOCK_SCHEDULE.
  const resolved = await resolveSchedule({
    adapters: [{ ...mock, isConfigured: () => true, fetch: (r) => mock.fetch(r) }],
    request: { region: 'US', windowStartUtc: NOW, windowEndUtc: endMs, channels },
    retries: 0,
  });

  const { available, stages } = selectAvailable(resolved.listings, {
    windowStartMs: NOW, windowEndMs: endMs, channels,
  });
  const ranked = rankListings(available, 'chronological');
  const data = buildResultSet({
    queryType: channels ? 'channel_schedule' : 'live_schedule',
    available: ranked,
    rankingMethod: 'chronological',
    pageSize: 1000,
    topPickIndex: pickTopIndex(ranked, { matchScore: (l) => (l.rating ?? 0) * 10 }),
    sources: resolved.sources,
    fallbackUsed: resolved.fallbackUsed,
    traceId: 'harness',
    stages,
    region: 'US',
    windowStartUtc: new Date(NOW).toISOString(),
    windowEndUtc: new Date(endMs).toISOString(),
  });

  const collapsed = collapseStages(stages);

  return (
    <div className="container-page space-y-6 py-6" data-testid="live-tv-harness">
      <header>
        <h1 className="text-xl font-bold text-white">Live TV pipeline — {hours}h window</h1>
        <p className="mt-1 text-sm text-slate-400">
          Real pipeline over a mock national grid. Provider: <code>mock_grid</code>. Not real listings.
        </p>
      </header>

      {/* Stage-by-stage diagnostics: it must be impossible for inventory to
          vanish silently between the source and the screen. */}
      <section className="card p-4" data-testid="stage-trace">
        <h2 className="text-sm font-bold text-white">Pipeline trace</h2>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-slate-500">
            <tr><th className="py-1">stage</th><th>in</th><th>out</th><th>rule</th></tr>
          </thead>
          <tbody className="text-slate-300">
            <tr data-testid="stage-raw">
              <td className="py-1 font-semibold">source raw</td>
              <td>—</td>
              <td className="tabular-nums" data-testid="raw-count">
                {resolved.sources.reduce((n, s) => n + s.rawCount, 0)}
              </td>
              <td className="text-slate-500">{resolved.sources.map((s) => `${s.sourceId}:${s.status}`).join(', ')}</td>
            </tr>
            {stages.map((s) => (
              <tr key={s.stage} data-testid={`stage-${s.stage}`}>
                <td className="py-1">{s.stage}</td>
                <td className="tabular-nums">{s.in}</td>
                <td className="tabular-nums">{s.out}</td>
                <td className="text-slate-500">{s.rule ?? ''}</td>
              </tr>
            ))}
            <tr data-testid="stage-returned">
              <td className="py-1 font-semibold">returned</td>
              <td className="tabular-nums">{data.totalAvailable}</td>
              <td className="tabular-nums" data-testid="returned-count">{data.totalReturned}</td>
              <td className="text-slate-500">page size {data.pageSize}</td>
            </tr>
          </tbody>
        </table>
        {collapsed.length > 0 && (
          <p className="mt-2 text-xs text-amber-200" data-testid="collapse-warning">
            ⚠ {collapsed.map((c) => `${c.stage} removed ${Math.round((1 - c.out / c.in) * 100)}% — ${c.rule}`).join('; ')}
          </p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-white">Registered providers</h2>
        <ul className="mt-2 space-y-1 text-xs text-slate-300" data-testid="provider-list">
          {providerCapabilities().map((p) => (
            <li key={p.providerId} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">{p.providerId}</span>
              <span className="text-slate-500">priority {p.priority}</span>
              <span className="text-slate-500">{p.role}</span>
              <span className={p.configured ? 'text-emerald-300' : 'text-slate-500'}>
                {p.configured ? 'configured' : 'not configured'}
              </span>
              <span className={p.isFullGrid ? 'text-emerald-300' : 'text-amber-300'}>
                {p.isFullGrid ? 'full grid' : 'partial'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <LiveScheduleView data={data} timeZone="America/New_York" nowMs={NOW} />
    </div>
  );
}
