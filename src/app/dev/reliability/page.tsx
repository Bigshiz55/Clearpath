import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { getReliabilitySummary } from '@/lib/monitoring';
import { getBuildInfo } from '@/lib/buildInfo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Reliability · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

/**
 * Minimal first-use reliability dashboard — item 9 of the reliability
 * sprint. Same gating as /api/dev/search-qa: open outside public production,
 * admin-email-only once deployed there. Reads straight from
 * `analytics_events` via the admin client; no new table, no client JS.
 */
function qaAllowedByEnv(): boolean {
  if (process.env.SEARCH_QA === '1') return true;
  return (process.env.VERCEL_ENV ?? 'development') !== 'production';
}

export default async function ReliabilityDashboardPage() {
  let allowed = qaAllowedByEnv();
  if (!allowed) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      allowed = isAdminEmail(user?.email);
    } catch {
      /* fall through to 404 */
    }
  }
  if (!allowed) notFound();

  const [day, week] = await Promise.all([getReliabilitySummary(24), getReliabilitySummary(24 * 7)]);
  const b = getBuildInfo();

  return (
    <div className="min-h-dvh">
      <main className="container-page max-w-3xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-black text-white">Reliability</h1>
          <p className="mt-1 text-sm text-slate-400">
            {b.appVersion} · {b.gitShaShort} · {b.vercelEnv || 'development'} · built {b.buildTimeLabel}
          </p>
        </div>

        <Table title="Last 24 hours" summary={day} />
        <Table title="Last 7 days" summary={week} />

        <p className="text-xs text-slate-500">
          Counts come from `analytics_events`, written server-side via the admin client so they record even without
          a session. Zero across the board can mean everything is healthy, or that no traffic has hit this
          environment yet — this page cannot tell those apart.
        </p>
      </main>
    </div>
  );
}

function Table({
  title,
  summary,
}: {
  title: string;
  summary: Awaited<ReturnType<typeof getReliabilitySummary>>;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold text-white">
        {title} <span className="text-sm font-normal text-slate-400">({summary.total} events)</span>
      </h2>
      {summary.truncated && (
        <p className="mt-1 text-xs text-amber-300">
          Row cap reached — these counts are a floor, not exact.
        </p>
      )}
      <table className="mt-3 w-full text-sm">
        <tbody>
          {summary.byName.map((row) => (
            <tr key={row.name} className="border-t border-white/10">
              <td className="py-1.5 pr-4 text-slate-300">{row.name}</td>
              <td className="py-1.5 text-right font-mono text-white">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
