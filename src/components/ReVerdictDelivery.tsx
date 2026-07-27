'use client';

/**
 * THE RE-VERD1CT, DELIVERED.
 *
 * Gathers the three things a rewatch ruling needs — the user's own viewing
 * history (server-only), the title's runtime and availability (quicklook), and
 * the learned rewatch profile (local) — and hands them to the pure engine. All
 * the judgement is in `rewatch.ts`; this file only fetches and renders.
 *
 * It shows the ruled-out titles WITH their reasons. Silently dropping something
 * the user deliberately put on the docket is how a verdict loses trust, and
 * "you gave up on this one" is genuinely useful information.
 */
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getRDocket,
  getRDocketServerSnapshot,
  subscribeRDocket,
  clearRDocket,
} from '@/lib/reverdictStore';
import {
  getRewatchProfile,
  getRewatchProfileServerSnapshot,
  subscribeRewatchProfile,
} from '@/lib/rewatchProfileStore';
import { MIN_FOR_REVERDICT, type DocketEntry } from '@/lib/reverdict/docket';
import { deliverReVerdict, type ReVerdict, type RewatchCandidate } from '@/lib/reverdict/rewatch';
import { describeRewatchProfile } from '@/lib/reverdict/rewatchQuiz';
import type { RewatchHistoryRow } from '@/app/api/rewatch-history/route';

/** Minutes out of quicklook's "1h 52m" / "3 seasons". Null when it is not a film. */
function minutesOf(runtime: string | null): number | null {
  if (!runtime) return null;
  const m = runtime.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

async function buildCandidates(docket: readonly DocketEntry[]): Promise<RewatchCandidate[]> {
  const history = await fetch('/api/rewatch-history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ keys: docket.map((e) => e.key) }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => ((d?.rows ?? []) as RewatchHistoryRow[]))
    .catch(() => [] as RewatchHistoryRow[]);

  const byKey = new Map(history.map((h) => [h.key, h]));

  return Promise.all(
    docket.map(async (e) => {
      const quick = await fetch(`/api/quicklook/${e.mediaType}/${e.tmdbId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d as { runtime?: string | null; where?: string[]; standardScore?: number; score?: number } | null)
        .catch(() => null);
      const h = byKey.get(e.key);
      return {
        key: e.key,
        title: e.title,
        lastWatchedAt: h?.lastWatchedAt ?? null,
        // No history row means we have no record of them watching it. The user
        // said they had by tapping the R, so we take them at their word — but
        // we do not manufacture a date or a rating to go with it.
        timesWatched: h ? Math.max(1, h.timesWatched) : 1,
        userRating: h?.userRating ?? null,
        finished: h?.finished ?? null,
        runtimeMinutes: minutesOf(quick?.runtime ?? null),
        availableOn: quick?.where ?? [],
        watchability:
          typeof quick?.standardScore === 'number'
            ? quick.standardScore
            : typeof quick?.score === 'number'
              ? quick.score
              : null,
      } satisfies RewatchCandidate;
    }),
  );
}

export function ReVerdictDelivery() {
  const docket = useSyncExternalStore(subscribeRDocket, getRDocket, getRDocketServerSnapshot);
  const profile = useSyncExternalStore(
    subscribeRewatchProfile,
    getRewatchProfile,
    getRewatchProfileServerSnapshot,
  );
  const [verdict, setVerdict] = useState<ReVerdict | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (docket.length < MIN_FOR_REVERDICT) {
      setVerdict(null);
      return;
    }
    let live = true;
    setLoading(true);
    void (async () => {
      const candidates = await buildCandidates(docket);
      if (!live) return;
      setVerdict(deliverReVerdict(candidates, Date.now(), profile));
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [docket, profile]);

  if (docket.length < MIN_FOR_REVERDICT) {
    return (
      <div className="card p-6 text-center" data-testid="reverdict-empty">
        <div className="text-3xl">🔨</div>
        <h2 className="mt-2 text-xl font-bold text-white">Not enough to rule on yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
          Tap the <span className="font-black text-amber-300">R</span> on {MIN_FOR_REVERDICT} or more things
          you have already seen, and I will tell you which one is worth another go tonight.
        </p>
        <Link href="/app/watchlist" className="btn-primary mt-4 inline-flex">Go find some →</Link>
      </div>
    );
  }

  if (loading || !verdict) {
    return <div className="h-64 animate-pulse rounded-2xl bg-white/5" data-testid="reverdict-loading" />;
  }

  const { winner, backup, alsoRan, ruledOut, margin, confidence } = verdict;

  return (
    <div className="space-y-4" data-testid="reverdict-result">
      {winner ? (
        <section className="card overflow-hidden p-0" data-testid="reverdict-winner">
          <div className="bg-gradient-to-br from-amber-500/25 via-amber-400/10 to-transparent p-5 sm:p-6">
            <div className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">
              Watch it again
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {winner.candidate.title}
            </h2>
            {winner.strengths.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" data-testid="reverdict-strengths">
                {winner.strengths.map((s) => (
                  <li
                    key={s}
                    className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section className="card p-5" data-testid="reverdict-none">
          <h2 className="text-lg font-bold text-white">No call tonight</h2>
          <p className="mt-1 text-sm text-slate-400">{confidence}</p>
        </section>
      )}

      {backup && (
        <section className="card p-4" data-testid="reverdict-backup">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">If not that</div>
          <div className="mt-0.5 text-lg font-bold text-white">{backup.candidate.title}</div>
          {margin && <p className="mt-1 text-sm text-slate-300" data-testid="reverdict-margin">{margin}</p>}
        </section>
      )}

      <p className="text-sm text-slate-400" data-testid="reverdict-confidence">{confidence}</p>

      {alsoRan.length > 0 && (
        <section className="card p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Also considered</div>
          <ul className="mt-1 space-y-0.5">
            {alsoRan.map((r) => (
              <li key={r.candidate.key} className="text-sm text-slate-300">{r.candidate.title}</li>
            ))}
          </ul>
        </section>
      )}

      {ruledOut.length > 0 && (
        <section className="card p-4" data-testid="reverdict-ruled-out">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Ruled out</div>
          <ul className="mt-1 space-y-1.5">
            {ruledOut.map((r) => (
              <li key={r.candidate.key} className="text-sm">
                <span className="font-semibold text-white">{r.candidate.title}</span>{' '}
                <span className="text-slate-400">{r.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={clearRDocket}
          data-testid="reverdict-reset"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >
          Start a new list
        </button>
        <Link
          href="/app/reverdict/quiz"
          data-testid="reverdict-quiz-link"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
        >
          {profile.samples > 0 ? 'Retake the rewatch quiz' : 'Teach me how you rewatch →'}
        </Link>
      </div>
      <p className="text-xs text-slate-500" data-testid="reverdict-profile">
        {describeRewatchProfile(profile)}
      </p>
    </div>
  );
}
