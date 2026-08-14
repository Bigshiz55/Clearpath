'use client';

/**
 * GENRE CALIBRATION — step one of the first-run Taste DNA flow.
 *
 * A broad canonical genre list (CALIBRATION_GENRES — derived from the app's
 * one genre vocabulary, never invented here) with a fast 1–10 preference
 * input per genre and an explicit "Not for me" rule-out, which the real
 * taste model expresses as its strongest negative attraction signal.
 *
 * NOTHING IS REQUIRED. Rate what you have feelings about, skip the rest —
 * an untouched genre writes nothing, because silence is not a preference.
 * Every answered genre writes immediately through `recordGenreAnswer` into
 * the same append-only preference log every other DNA surface feeds.
 *
 * CONTROLS ARE REAL BUTTONS: keyboard- and touch-accessible by construction,
 * with visible default / hover / focus-visible / selected states, and the
 * rating row disables while "Not for me" holds (a ruled-out genre has no
 * meaningful 7).
 */
import { useState } from 'react';
import Link from 'next/link';
import { CALIBRATION_GENRES } from '@/lib/preference/genreCalibration';
import { recordGenreAnswer } from '@/lib/actions/genreCalibration';
import { announceDnaChanged } from '@/components/onboarding/DnaProgressMeter';

type Answer = { rating?: number; notForMe?: boolean };

function eventId(slug: string, suffix: string): string {
  return `genrecal:${slug}:${suffix}:${Math.random().toString(36).slice(2, 8)}`;
}

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function GenreCalibration({
  continueHref,
  sessionId,
}: {
  continueHref: string;
  sessionId?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  function rate(slug: string, rating: number) {
    setAnswers((a) => ({ ...a, [slug]: { rating } }));
    void recordGenreAnswer({ eventId: eventId(slug, String(rating)), slug, rating, sessionId })
      .then((r) => {
        // The meter refreshes only on a PERSISTED write — an optimistic tap
        // that never landed must never move it.
        if (r.ok) announceDnaChanged();
      })
      .catch(() => {});
  }

  function ruleOut(slug: string) {
    const wasOut = answers[slug]?.notForMe === true;
    if (wasOut) {
      // Un-toggling only clears the local selection; the log is append-only
      // and a later rating writes the newer statement.
      setAnswers((a) => ({ ...a, [slug]: {} }));
      return;
    }
    setAnswers((a) => ({ ...a, [slug]: { notForMe: true } }));
    void recordGenreAnswer({ eventId: eventId(slug, 'out'), slug, notForMe: true, sessionId })
      .then((r) => {
        if (r.ok) announceDnaChanged();
      })
      .catch(() => {});
  }

  const answered = Object.values(answers).filter((a) => a.rating != null || a.notForMe).length;

  return (
    <section data-testid="genre-calibration" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">How do you feel about…</h1>
        <p className="mt-1 text-sm text-slate-400">
          1 = never for me, 10 = always for me. Rate the genres you have real feelings about and
          skip the rest — skipping writes nothing.
        </p>
      </div>

      <ul className="space-y-2">
        {CALIBRATION_GENRES.map((g) => {
          const a = answers[g.slug] ?? {};
          const out = a.notForMe === true;
          return (
            <li key={g.slug} className="rounded-xl border border-white/10 bg-white/[0.03] p-3" data-testid={`genre-row-${g.slug}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-white">{g.label}</div>
                <button
                  type="button"
                  onClick={() => ruleOut(g.slug)}
                  aria-pressed={out}
                  data-testid={`genre-out-${g.slug}`}
                  className={[
                    'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300',
                    out
                      ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                      : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
                  ].join(' ')}
                >
                  Not for me
                </button>
              </div>
              <div
                role="group"
                aria-label={`${g.label} preference, 1 to 10`}
                className="mt-2 flex flex-wrap gap-1"
              >
                {SCALE.map((n) => {
                  const selected = !out && a.rating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={out}
                      onClick={() => rate(g.slug, n)}
                      aria-pressed={selected}
                      aria-label={`${g.label}: ${n} of 10`}
                      data-testid={`genre-rate-${g.slug}-${n}`}
                      className={[
                        'grid h-9 w-9 place-items-center rounded-lg border text-sm font-bold tabular-nums transition',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-300',
                        out
                          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600'
                          : selected
                            ? 'border-brand-400 bg-brand-500/30 text-white shadow-[0_0_0_2px_rgba(168,85,247,0.35)]'
                            : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
                      ].join(' ')}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/95 p-3 backdrop-blur">
        <p className="text-xs text-slate-400" data-testid="genre-progress">
          {answered === 0 ? 'Nothing rated yet — that’s fine.' : `${answered} genre${answered === 1 ? '' : 's'} answered.`}
        </p>
        <Link href={continueHref} className="btn-primary px-4 py-2 text-sm" data-testid="genre-continue">
          Continue → Taste Quiz
        </Link>
      </div>
    </section>
  );
}
