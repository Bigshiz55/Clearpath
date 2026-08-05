import { FEASIBILITY_MATRIX, blockedOn } from '@/lib/tv/sources/feasibility';
import { dataModeReport } from '@/lib/tv/dataMode';
import { STAGE_LABEL } from '@/lib/tv/supportStage';
import { egressCounts } from '@/lib/tv/egressGuard';
import { SCALE } from '@/lib/tv/fixtures/generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'TV source coverage — admin' };

/**
 * THE COVERAGE AND SOURCE-HEALTH DASHBOARD.
 *
 * One screen that answers, without anybody having to ask in Slack:
 *   - what is this deployment allowed to call, and did it call anything;
 *   - which sources exist, at what stage, and what each is blocked on;
 *   - what a normal user can actually be shown right now.
 *
 * Read-only by design. Stage changes are made by the ingestion pipeline from
 * recorded evidence, never by a button here — a dashboard that can promote a
 * source is a dashboard that will, on a deadline, promote one that has not
 * earned it.
 */
const VERDICT_STYLE: Record<string, string> = {
  go: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30',
  conditional: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
  no_go: 'bg-rose-400/15 text-rose-200 border-rose-400/30',
};

export default function AdminTvPage() {
  const mode = dataModeReport();
  const counts = egressCounts();
  const blocked = blockedOn();
  const userVisible = FEASIBILITY_MATRIX.filter(
    (r) => r.stage === 'verified' || r.stage === 'production_supported');

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">TV source coverage</h1>

      <section data-testid="admin-tv-mode" className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Data mode</h2>
        {mode.configured ? (
          <p className="mt-1 text-sm text-white/70">
            <strong className="text-white/90">{mode.mode}</strong>
            {mode.explicit ? ' (explicitly configured)' : ' (default for this environment)'}
            {' · '}VERCEL_ENV {mode.vercelEnv ?? 'unset'}
          </p>
        ) : (
          <p className="mt-1 rounded border border-rose-400/40 bg-rose-400/10 p-2 text-sm text-rose-100">
            <strong>CONFIGURATION_ERROR.</strong> {mode.configurationError?.reason}
          </p>
        )}
        <ul className="mt-2 text-sm text-white/60">
          {mode.meteredAdapters.map((a) => (
            <li key={a.adapterId}>
              {a.adapterId}: {a.enabled ? 'enabled' : 'disabled'} —{' '}
              {a.egress.allowed ? 'may spend' : `blocked (${'code' in a.egress ? a.egress.code : ''})`}
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="admin-tv-egress" className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Egress, this instance</h2>
        <p className="mt-1 text-sm text-white/70">
          {counts.allowed} allowed · {counts.denied} denied
        </p>
        <p className="mt-1 text-xs text-white/45">
          Per-instance and since start. The durable record is `source_requests`.
        </p>
      </section>

      <section data-testid="admin-tv-visible" className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">What a normal user can be shown</h2>
        {userVisible.length === 0 ? (
          <p className="mt-1 text-sm text-white/70">
            No source has reached <code>verified</code> yet, so no source-attributed
            data is user-visible in production. Fixture data is excluded by both
            the database views and the read layer.
          </p>
        ) : (
          <ul className="mt-1 text-sm text-white/70">
            {userVisible.map((r) => <li key={r.slug}>{r.slug} — {STAGE_LABEL[r.stage]}</li>)}
          </ul>
        )}
      </section>

      <section data-testid="admin-tv-sources" className="mt-4">
        <h2 className="font-semibold">Sources</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-white/50">
              <tr>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Verdict</th>
                <th className="py-2 pr-3">Cost</th>
                <th className="py-2 pr-3">Coverage</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {FEASIBILITY_MATRIX.map((r) => (
                <tr key={r.slug} data-testid="admin-tv-source-row" className="border-t border-white/10">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3 text-white/70">{r.stage}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${VERDICT_STYLE[r.verdict]}`}>
                      {r.verdict}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-white/70">{r.costClass}</td>
                  <td className="py-2 pr-3 text-white/70">{r.coverageLevel}</td>
                  <td className="py-2 text-white/60">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section data-testid="admin-tv-blocked" className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Blocked on something outside the codebase</h2>
        <ul className="mt-1 text-sm text-white/70">
          {blocked.map((b) => <li key={b.slug}>{b.slug} — needs {b.needs}</li>)}
        </ul>
      </section>

      <section className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/60">
        <h2 className="font-semibold text-white/80">Fixture corpus targets</h2>
        <p className="mt-1">
          {SCALE.titles.toLocaleString()} titles · {SCALE.episodes.toLocaleString()} episodes ·{' '}
          {SCALE.offers.toLocaleString()} offers · {SCALE.networks} networks · {SCALE.scheduleDays} days.
          Generated deterministically; never shown to production users.
        </p>
      </section>
    </main>
  );
}
