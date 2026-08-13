import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CALL_LIMIT } from '@/lib/watchmode/sync';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Watchmode · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Read-only headroom view for the Watchmode free-tier budget guard (see
 * src/lib/watchmode/sync.ts). Gated the same way as /admin/feedback and
 * the /admin layout: a single server-side ADMIN_EMAILS check that 404s
 * everyone else. Reads via the service-role client, since
 * `watchmode_call_ledger` and `watchmode_title_map` have no SELECT policy —
 * same reasoning as `tv_call_ledger`/`tv_ingestion_runs`.
 */
export default async function AdminWatchmodePage() {
  const admin = createAdminClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [
    { count: usedThisMonth },
    { count: titleMapRows },
    { count: availabilityRows },
    { count: titlesChecked },
    { data: lastTitleMapImport },
    { data: recentCalls },
  ] = await Promise.all([
    admin.from('watchmode_call_ledger').select('id', { count: 'exact', head: true }).eq('counts_against_allowance', true).gte('requested_at', monthStart),
    admin.from('watchmode_title_map').select('watchmode_id', { count: 'exact', head: true }),
    admin.from('watchmode_availability').select('id', { count: 'exact', head: true }),
    admin.from('watchmode_fetch_state').select('tmdb_id', { count: 'exact', head: true }),
    admin.from('watchmode_call_ledger').select('requested_at').eq('endpoint', 'title_id_map_csv').order('requested_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('watchmode_call_ledger').select('endpoint, requested_at, response_status').order('requested_at', { ascending: false }).limit(20),
  ]);

  const used = usedThisMonth ?? 0;
  const remaining = Math.max(0, MONTHLY_CALL_LIMIT - used);
  const pctUsed = Math.min(100, Math.round((used / MONTHLY_CALL_LIMIT) * 100));

  return (
    <div className="min-h-dvh">
      <main className="container-page max-w-3xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-black text-white">Watchmode</h1>
          <p className="mt-1 text-sm text-slate-400">
            Streaming-availability sync — free-tier budget headroom. Non-commercial testing configuration; see the
            deploy report for why a paid tier is required before launch.
          </p>
        </div>

        <div className="card space-y-3 p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-black tabular-nums text-white">
                {used.toLocaleString()} <span className="text-lg font-semibold text-slate-400">/ {MONTHLY_CALL_LIMIT.toLocaleString()}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">calls this calendar month (UTC)</div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black tabular-nums ${remaining < 200 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {remaining.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">remaining</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${pctUsed >= 100 ? 'bg-red-400' : pctUsed >= 90 ? 'bg-amber-400' : 'bg-emerald-400'}`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            Hard-capped at {MONTHLY_CALL_LIMIT.toLocaleString()} — Watchmode&rsquo;s free Developer tier allows 2,500/month; the
            500-call gap is deliberate headroom, not a rounding choice.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Title map rows', titleMapRows ?? 0],
            ['Titles checked', titlesChecked ?? 0],
            ['Availability source rows', availabilityRows ?? 0],
            ['Last title-map import', formatWhen(lastTitleMapImport?.requested_at ?? null)],
          ].map(([label, value]) => (
            <div key={label as string} className="card p-3">
              <div className="text-lg font-black tabular-nums text-white">{value}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
            </div>
          ))}
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-bold text-white">Recent calls</h2>
          {!recentCalls || recentCalls.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Nothing logged yet — the sync hasn&rsquo;t run, or no key is set.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-1 pr-3 font-semibold">When</th>
                    <th className="pb-1 pr-3 font-semibold">Endpoint</th>
                    <th className="pb-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalls.map((c, i) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="py-1 pr-3 tabular-nums text-slate-300">{formatWhen(c.requested_at)}</td>
                      <td className="py-1 pr-3 text-slate-300">{c.endpoint}</td>
                      <td className="py-1 tabular-nums text-slate-300">{c.response_status ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
