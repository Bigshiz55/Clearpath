'use client';

/**
 * DELIVERING THE VERD1CT.
 *
 * Gathers the facts for every title on the docket from the endpoints that
 * already serve every card in the product — the per-title DNA score and the
 * quicklook facts (runtime, what it is on, the general score) — then hands them
 * to the pure engine and renders its decision.
 *
 * The rendering has one rule: it is a DECISION, not a leaderboard. One winner,
 * one backup, the sentence that separated them, and everything that was ruled
 * out WITH its reason. The also-rans are collapsed by default, because a list
 * of five is the shrug this feature exists to replace.
 */
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  clearDocket,
  getDocket,
  getDocketServerSnapshot,
  removeFromDocketStore,
  subscribeDocket,
} from '@/lib/docketStore';
import { MIN_FOR_VERDICT, type DocketEntry } from '@/lib/verdict/docket';
import { deliverVerdict, type Candidate, type Verdict } from '@/lib/verdict/rank';
import { useSyncExternalStore } from 'react';

/** Minutes out of quicklook's "1h 52m" / "3 seasons". Null when it is not a film. */
function minutesOf(runtime: string | null): number | null {
  if (!runtime) return null;
  const m = runtime.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

async function factsFor(e: DocketEntry): Promise<Candidate> {
  const [dna, quick] = await Promise.all([
    fetch(`/api/dna/${e.mediaType}/${e.tmdbId}`)
      .then((r) => r.json())
      .then((d) => (d?.dna ?? null) as { score?: number; confidence?: number; sampleSize?: number } | null)
      .catch(() => null),
    fetch(`/api/quicklook/${e.mediaType}/${e.tmdbId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d as { runtime?: string | null; where?: string[]; standardScore?: number; score?: number } | null)
      .catch(() => null),
  ]);

  return {
    key: e.key,
    title: e.title,
    // The general Watchability is the base; null when we genuinely could not
    // compute one, so the engine falls back rather than inventing a number.
    watchability: typeof quick?.standardScore === 'number' ? quick.standardScore : typeof quick?.score === 'number' ? quick.score : null,
    personalMatch: typeof dna?.score === 'number' ? dna.score : null,
    matchConfidence: typeof dna?.confidence === 'number' ? dna.confidence : 0,
    runtimeMinutes: minutesOf(quick?.runtime ?? null),
    availableOn: quick?.where ?? [],
  };
}

export function VerdictDelivery() {
  const docket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [showRest, setShowRest] = useState(false);

  const run = useCallback(async () => {
    if (docket.length < MIN_FOR_VERDICT) return;
    setState('working');
    try {
      const candidates = await Promise.all(docket.map(factsFor));
      setVerdict(deliverVerdict(candidates));
      setState('done');
    } catch {
      setState('error');
    }
  }, [docket]);

  // Landing here from the tray means the answer is what you came for.
  useEffect(() => {
    if (state === 'idle' && docket.length >= MIN_FOR_VERDICT) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docket.length]);

  if (docket.length < MIN_FOR_VERDICT) {
    return (
      <div className="card p-6" data-testid="verdict-empty">
        <h1 className="text-2xl font-bold text-white">Nothing to rule on yet</h1>
        <p className="mt-1 text-sm text-slate-400">
          Put at least {MIN_FOR_VERDICT} things you have not seen on the docket — tap the{' '}
          <span className="font-black text-[#ff1493]">W</span> on any poster — and I will tell you which one to
          watch tonight.
        </p>
        <Link href="/app/watch" className="btn-primary mt-4 inline-flex min-h-[44px] items-center px-5">
          Find some candidates →
        </Link>
      </div>
    );
  }

  if (state === 'working' || state === 'idle') {
    return (
      <div className="card p-6 text-sm text-slate-400" data-testid="verdict-working">
        Weighing {docket.length} candidates…
      </div>
    );
  }

  if (state === 'error' || !verdict) {
    return (
      <div className="card p-6" data-testid="verdict-error">
        <p className="text-sm text-amber-200">Could not weigh those up just now.</p>
        <button type="button" onClick={() => void run()} className="btn-primary mt-3 inline-flex min-h-[44px] items-center px-5">
          Try again
        </button>
      </div>
    );
  }

  const { winner, backup, alsoRan, ruledOut, margin, confidence } = verdict;

  return (
    <div className="space-y-4" data-testid="verdict">
      {winner ? (
        <section className="card overflow-hidden p-0" data-testid="verdict-winner">
          <div className="bg-gradient-to-br from-[#ff1493]/25 via-brand-500/10 to-transparent p-5 sm:p-6">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#ff1493]">The Verd1ct</div>
            <h1 className="mt-1 text-3xl font-black leading-tight text-white sm:text-4xl">
              {winner.candidate.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-sm font-black tabular-nums text-white">
                {Math.round(winner.score)}
              </span>
              {winner.strengths.map((s) => (
                <span key={s} className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {s}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-200" data-testid="verdict-confidence">{confidence}</p>
          </div>
        </section>
      ) : (
        <section className="card p-6" data-testid="verdict-none">
          <h1 className="text-2xl font-bold text-white">Nothing here works tonight</h1>
          <p className="mt-1 text-sm text-slate-300">{confidence}</p>
        </section>
      )}

      {backup && (
        <section className="card p-5" data-testid="verdict-backup">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">If not that, then</div>
          <div className="mt-0.5 text-lg font-bold text-white">{backup.candidate.title}</div>
          {/* The part nobody else does: why the runner-up lost. */}
          <p className="mt-1 text-sm text-slate-300" data-testid="verdict-margin">
            {margin ?? 'Nothing meaningful separated these two — either is a fair call.'}
          </p>
        </section>
      )}

      {ruledOut.length > 0 && (
        <section className="card p-5" data-testid="verdict-ruled-out">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Ruled out</div>
          <ul className="mt-2 space-y-1.5">
            {ruledOut.map((r) => (
              <li key={r.candidate.key} className="text-sm text-slate-300">
                <span className="font-semibold text-white">{r.candidate.title}</span> — {r.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {alsoRan.length > 0 && (
        <section className="card p-5">
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            data-testid="verdict-also-ran-toggle"
            className="inline-flex min-h-[40px] items-center text-sm font-semibold text-slate-300 hover:text-white"
          >
            {showRest ? 'Hide' : `Show the other ${alsoRan.length}`}
          </button>
          {showRest && (
            <ul className="mt-2 space-y-1.5" data-testid="verdict-also-ran">
              {alsoRan.map((r) => (
                <li key={r.candidate.key} className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{r.candidate.title}</span>
                  <span className="tabular-nums text-slate-500">{Math.round(r.score)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {winner && (
          <Link
            href={`/app/title/${winner.candidate.key.split(':')[0]}/${winner.candidate.key.split(':')[1]}`}
            className="btn-primary inline-flex min-h-[48px] items-center px-6 text-base"
            data-testid="verdict-open-winner"
          >
            Take me to it →
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            clearDocket();
            setVerdict(null);
            setState('idle');
          }}
          data-testid="verdict-clear"
          className="inline-flex min-h-[48px] items-center rounded-lg border-2 border-[#ff1493]/45 bg-[#ff1493]/10 px-5 text-sm font-bold text-pink-100 transition hover:bg-[#ff1493]/20"
        >
          Start a new docket
        </button>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">What was on the docket</summary>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {docket.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => removeFromDocketStore(e.key)}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/12 px-3 hover:bg-white/10"
              >
                {e.title} <span aria-hidden>✕</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
