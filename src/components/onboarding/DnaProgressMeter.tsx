'use client';

/**
 * LIVE DNA PROGRESS DURING ONBOARDING — the real metric, nothing invented.
 *
 * A slim, in-flow strip (it sits ABOVE the step content and can never cover
 * a card — nothing here is position:fixed) showing the two numbers this
 * product already owns:
 *
 *   • DNA Confidence percent + tier — `computeDnaConfidence`, the same
 *     figure the DNA hub's confidence panel reports.
 *   • Onboarding quiz progress — `calibrationProgress`, the same n-of-20
 *     the grid's own progress model reports.
 *
 * IT CHANGES ONLY WHEN PERSISTED STATE CHANGES. The numbers come from
 * `/api/dna-progress`, a pure server fold of stored rows; this component
 * never does client arithmetic on them. Surfaces that persist an answer
 * dispatch `wv:dna-changed`, which triggers a refetch — so an optimistic
 * tap that never lands can never move the meter, and a reload shows exactly
 * the persisted state.
 */
import { useCallback, useEffect, useState } from 'react';

export const DNA_CHANGED_EVENT = 'wv:dna-changed';

/** Tell the meter (and anything else listening) that a DNA write persisted. */
export function announceDnaChanged() {
  try {
    window.dispatchEvent(new Event(DNA_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

interface Progress {
  confidence: { percent: number; tier: string };
  quiz: { index: number; size: number; percent: number; complete: boolean };
}

export function DnaProgressMeter({ sessionId }: { sessionId?: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);

  const refetch = useCallback(() => {
    const qs = sessionId ? `?session=${encodeURIComponent(sessionId)}` : '';
    fetch(`/api/dna-progress${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Progress | null) => {
        if (body && body.confidence && body.quiz) setProgress(body);
      })
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    refetch();
    window.addEventListener(DNA_CHANGED_EVENT, refetch);
    return () => window.removeEventListener(DNA_CHANGED_EVENT, refetch);
  }, [refetch]);

  // No metric yet (first fetch in flight, or the read failed): render nothing
  // rather than a made-up zero — absence of evidence is not a number.
  if (!progress) return null;

  const pct = Math.max(0, Math.min(100, progress.confidence.percent));
  return (
    <div
      data-testid="dna-progress-meter"
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
    >
      <span aria-hidden className="text-lg">🧬</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
            DNA confidence · <span className="tabular-nums text-white">{pct}%</span>{' '}
            <span className="font-semibold capitalize text-brand-300">{progress.confidence.tier}</span>
          </span>
          <span className="text-[11px] tabular-nums text-slate-500" data-testid="dna-progress-quiz">
            quiz {Math.min(progress.quiz.index, progress.quiz.size)}/{progress.quiz.size}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="DNA confidence">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-[#ff1493] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
