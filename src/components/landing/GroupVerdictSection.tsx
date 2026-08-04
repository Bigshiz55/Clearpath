'use client';

import { useStartCourt } from '@/lib/court/useStartCourt';

/**
 * "Verdict Room" is the one courtroom-flavored name kept here on purpose —
 * per the string-audit rule, it earns its place because it names a real,
 * specific feature, not a clever synonym for a plain action. The button
 * reuses `useStartCourt`, the exact same room-creation path the app's own
 * Verdict Room entry points use — no separate/duplicated flow, and no
 * account required (`court_create` is granted to anon).
 */
export function GroupVerdictSection() {
  const { start, loading, error } = useStartCourt();
  return (
    <section className="border-t border-white/10" data-testid="group-verdict-section">
      <div className="container-page py-8 text-center sm:py-10">
        <h2 className="text-xl font-extrabold text-white sm:text-2xl">Watching together? End the debate.</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
          Invite the people watching, combine everyone&rsquo;s preferences, and get one shared Verd1ct.
        </p>
        <button
          type="button"
          onClick={() => void start()}
          disabled={loading}
          data-testid="try-group-verdict"
          className="btn-secondary mt-4 px-6 py-2.5 text-sm transition hover:scale-[1.02] disabled:opacity-60"
        >
          {loading ? 'Opening the Verdict Room…' : 'TRY A GROUP VERD1CT'}
        </button>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </section>
  );
}
