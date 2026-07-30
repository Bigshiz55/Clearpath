'use client';

import { useState } from 'react';
import type { MediaType } from '@/lib/types';
import { recordPostWatch } from '@/lib/actions/postWatch';
import { REACTIONS, alreadyAnswered, gradeCall, type CallGrade, type Reaction } from '@/lib/verdict/postWatch';

/**
 * THE ONE QUESTION THAT PROVES A RECOMMENDATION.
 *
 * It appears only after a title is marked watched, and only if we don't already
 * hold a rating for it — asking twice would nag the user AND double-count in our
 * own accuracy. Answering writes the rating Taste-DNA learns from, so this
 * improves the product rather than only measuring it.
 *
 * The reply is the point. Most apps say "thanks for your feedback"; this one
 * says what it predicted, what you said, and whether that makes it right or
 * wrong — including "we got that one wrong", which is the whole reason a user
 * would believe the times we say we called it.
 */
/**
 * What we say after we've been graded. Exported so the visual harness can show
 * all four outcomes (hit / partial / miss / nothing-to-grade) without needing a
 * signed-in session and four different watch histories to produce them.
 */
export function GradePanel({ grade }: { grade: CallGrade }) {
  const tone =
    grade.result === 'hit'
      ? 'border-emerald-400/40 bg-emerald-500/10'
      : grade.result === 'miss'
        ? 'border-red-400/40 bg-red-500/10'
        : grade.result === 'partial'
          ? 'border-yellow-400/40 bg-yellow-500/10'
          : '';
  return (
    <section className={`card p-5 sm:p-6 ${tone}`} data-testid="post-watch-grade">
      <h2 className="text-lg font-semibold text-white">{grade.headline}</h2>
      <p className="mt-1 text-sm text-slate-300">{grade.detail}</p>
    </section>
  );
}

export function DidWeGetItRight({
  tmdbId,
  mediaType,
  title,
  year = null,
  posterPath = null,
  /** The score that was on screen when they decided. Null = nothing to grade. */
  predicted,
  /** Any rating we already hold. Non-null means they've answered — we stay quiet. */
  existingRating = null,
  genres = [],
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  predicted: number | null;
  existingRating?: number | null;
  genres?: string[];
}) {
  const [grade, setGrade] = useState<CallGrade | null>(null);
  const [busy, setBusy] = useState<Reaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // DEDUPE. A rating on record is an answer on record, whether it came from
  // this panel or from the watchlist.
  if ((alreadyAnswered(existingRating) && !grade) || dismissed) return null;

  async function answer(reaction: Reaction) {
    setBusy(reaction);
    setError(null);
    // Show our own grade optimistically — it is pure and needs no round trip —
    // then let the server confirm. A failed save clears it rather than leaving
    // a verdict on screen that we never actually recorded.
    const optimistic = gradeCall(predicted, reaction);
    const res = await recordPostWatch({ tmdbId, mediaType, title, year, posterPath, reaction, predicted, genres });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Couldn’t save that — try again.');
      return;
    }
    setGrade(res.grade ?? optimistic);
  }

  if (grade) return <GradePanel grade={grade} />;

  return (
    <section className="card p-5 sm:p-6" data-testid="post-watch-ask">
      <h2 className="text-lg font-semibold text-white">Did we get it right?</h2>
      <p className="mt-1 text-sm text-slate-400">
        You watched {title}. Tell us how it landed and we’ll show you whether our call held up — and use it on your next
        set of picks.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => answer(r.id)}
            disabled={busy !== null}
            data-testid={`post-watch-${r.id}`}
            className="rounded-xl border border-white/12 bg-white/5 px-3 py-3 text-left transition hover:border-brand-400/50 hover:bg-white/10 disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-white">{r.label}</span>
            <span className="mt-0.5 block text-[11px] leading-tight text-slate-400">{r.hint}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <button type="button" onClick={() => setDismissed(true)} className="btn-ghost mt-3 text-sm">
        Not now
      </button>
    </section>
  );
}
