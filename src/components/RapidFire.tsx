'use client';

/**
 * RAPID FIRE, ON SCREEN.
 *
 * One title, one question, six answers, next. The interaction is deliberately
 * the taste quiz's — 2×N answer grid, live panel, a Back that reverses — because
 * a second grammar for the same gesture is just a thing to learn twice.
 *
 * Two things it does that the quiz does not:
 *   • The question CHANGES with the evidence. Something you abandoned is asked
 *     about differently from something you finished, and the evidence line
 *     ("You watched 2 episodes and stopped") is printed verbatim from the file
 *     so you can actually remember it.
 *   • The two escape hatches are always present and never buried. `resolveAnswer`
 *     in `rapidFire.ts` decides what they mean; this component only renders them.
 *
 * Posters are looked up by TITLE against the real catalogue rather than being
 * carried in the data, so a sample row can never put the wrong artwork next to
 * a name. A miss shows the title, which is honest.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SeeRecommendations } from '@/components/SeeRecommendations';
import {
  answersFor,
  questionFor,
  resolveAnswer,
  summarise,
  type AnswerKey,
  type RapidFireItem,
} from '@/lib/import/rapidFire';

// Cinematic, restrained: the two decisive poles carry a soft emerald/rose
// wash, everything in between is a single quiet neutral. No competing accent
// hues, no hard-coded magenta — the brand blue is the only accent, used once
// (the progress bar). A decision surface, not a control panel.
const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-50 hover:border-emerald-300/60 hover:bg-emerald-500/20',
  bad: 'border-rose-400/40 bg-rose-500/10 text-rose-50 hover:border-rose-300/60 hover:bg-rose-500/20',
  neutral: 'border-white/12 bg-white/[0.05] text-slate-200 hover:border-white/25 hover:bg-white/[0.09]',
};

const KIND_BADGE: Record<RapidFireItem['kind'], { label: string; className: string }> = {
  abandoned: { label: 'You stopped watching', className: 'border-white/15 bg-white/[0.06] text-slate-300' },
  rewatched: { label: 'You went back to it', className: 'border-brand-400/40 bg-brand-500/10 text-brand-100' },
  watched: { label: 'You watched it', className: 'border-white/15 bg-white/[0.06] text-slate-300' },
};

/** One in-flight poster lookup per title, shared across renders. */
const posterCache = new Map<string, Promise<string | null>>();

function loadPoster(title: string, mediaType: 'movie' | 'tv'): Promise<string | null> {
  const key = `${mediaType}:${title}`;
  let p = posterCache.get(key);
  if (!p) {
    p = fetch(`/api/search?q=${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const results = (d?.results ?? []) as Array<{ mediaType: string; title: string; posterUrl?: string | null; posterPath?: string | null }>;
        // Prefer an exact title match of the right media type — a fuzzy first
        // result is how a demo ends up showing the wrong film.
        const wanted = title.trim().toLowerCase();
        const exact = results.find((r) => r.mediaType === mediaType && r.title.trim().toLowerCase() === wanted);
        const hit = exact ?? results.find((r) => r.mediaType === mediaType) ?? null;
        return hit?.posterUrl ?? null;
      })
      .catch(() => null);
    posterCache.set(key, p);
  }
  return p;
}

function Cover({ item }: { item: RapidFireItem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    loadPoster(item.title, item.mediaType).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [item.title, item.mediaType]);

  return (
    <div className="relative aspect-[2/3] w-32 flex-none overflow-hidden rounded-2xl bg-ink-800 shadow-xl shadow-black/60 ring-1 ring-white/10 sm:w-40">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center p-2 text-center text-xs font-semibold text-slate-400">
          {item.title}
        </span>
      )}
    </div>
  );
}

export function RapidFire({
  queue,
  /** Called for every answer. The caller decides whether to persist anything. */
  onAnswer,
  onFinish,
  /** Shown above the card — used by the demo to say the data is not real. */
  notice,
  /**
   * Does this run actually teach the DNA? The demo does not, so it must not
   * offer "see my recommendations" as the reward for finishing — nothing it
   * did would be reflected there.
   */
  savesToDna = true,
}: {
  queue: RapidFireItem[];
  onAnswer?: (item: RapidFireItem, answer: AnswerKey) => void;
  onFinish?: (answers: AnswerKey[]) => void;
  notice?: React.ReactNode;
  savesToDna?: boolean;
}) {
  const [answers, setAnswers] = useState<AnswerKey[]>([]);
  const [done, setDone] = useState(false);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const index = answers.length;
  const item = queue[index];
  const summary = summarise(answers, queue.length);

  const answer = useCallback(
    (key: AnswerKey) => {
      if (!item) return;
      onAnswer?.(item, key);
      setAnswers((prev) => [...prev, key]);
    },
    [item, onAnswer],
  );

  // 1–6 answer the current card, matching the taste quiz's keyboard support.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!item || done) return;
      const n = Number(e.key);
      const options = answersFor(item.kind);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        answer(options[n - 1]!.key);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, done, answer]);

  if (queue.length === 0) {
    return (
      <div className="card p-6 text-center" data-testid="rapid-empty">
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 text-xl font-bold text-white">Nothing left to ask about</h2>
        <p className="mt-1 text-sm text-slate-400">Import some history and this fills up.</p>
      </div>
    );
  }

  if (done || !item) {
    return (
      <div className="card p-6" data-testid="rapid-done">
        <div className="text-xs font-black uppercase tracking-[0.15em] text-brand-300">Done for now</div>
        <h2 className="mt-1 text-2xl font-black text-white">{summary.message}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {summary.taught > 0
            ? `Those ${summary.taught} are worth far more than the rows they replaced — an opinion you stated counts for five to eight times what "you pressed play" does.`
            : 'Nothing was recorded, which is the right outcome when you could not remember them.'}
        </p>
        {/* THE WAY OUT. This screen used to offer only "keep going", so the
            one moment somebody had just taught the recommender something was
            the moment the app gave them nowhere to go and see it. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {savesToDna && <SeeRecommendations taught={summary.taught} />}
          {summary.remaining > 0 && (
            <button
              type="button"
              onClick={() => setDone(false)}
              data-testid="rapid-continue"
              className={`inline-flex min-h-[48px] items-center rounded-lg border border-white/15 px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 ${savesToDna ? '' : 'btn-primary text-base'}`}
            >
              Keep going — {summary.remaining} left →
            </button>
          )}
        </div>
      </div>
    );
  }

  const options = answersFor(item.kind);
  // The two escape hatches are always the last two (rapidFire.ts appends
  // ESCAPES). Rendering them as a quiet secondary row — not four equal-weight
  // tiles — keeps the DECISION the focal point and stops "Wasn't me" / "Don't
  // remember" from competing with an actual opinion for the eye.
  const opinions = options.slice(0, -2);
  const escapes = options.slice(-2);
  const badge = KIND_BADGE[item.kind];
  const pct = Math.round((index / queue.length) * 100);

  return (
    <div data-testid="rapid-fire">
      {notice}

      {/* THE CARD IS THE WHOLE SCREEN. Poster → title → question → decisions,
          one focal object; the only chrome is a slim progress line above it and
          a quiet Back. Keyed on the index so each new title eases in. */}
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-300 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="shrink-0 text-xs font-semibold tabular-nums text-slate-400" data-testid="rapid-progress">
          {index + 1} / {queue.length}
        </div>
      </div>

      <div
        key={index}
        className="card overflow-hidden bg-gradient-to-b from-ink-850/80 to-ink-900/80 p-5 motion-safe:animate-fade-up sm:p-6"
        data-testid={`rapid-card-${item.key}`}
      >
        <div className="flex gap-4 sm:gap-5">
          <Cover item={item} />
          <div className="min-w-0 flex-1">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
              data-testid="rapid-kind"
            >
              {badge.label}
            </span>
            <h2 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">{item.title}</h2>
            {/* Straight from the file. This is what makes the question answerable. */}
            <p className="mt-2 text-sm leading-relaxed text-slate-400" data-testid="rapid-evidence">
              {item.evidence}
            </p>
          </div>
        </div>

        <p className="mt-5 text-lg font-bold text-white sm:text-xl" data-testid="rapid-question">
          {questionFor(item)}
        </p>

        {/* THE DECISION — larger premium tiles, 2-up so nothing overflows 320px. */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {opinions.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => answer(o.key)}
              data-testid={`rapid-answer-${o.key}`}
              className={`min-h-[60px] rounded-2xl border px-3 text-sm font-bold transition-all duration-150 active:scale-[0.97] sm:text-base ${TONE[o.tone]}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* THE ESCAPES — present on every card (a hard requirement), but quiet:
            a thin secondary row, still a 44px tap target, never shouting over
            the real answer above. */}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          {escapes.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => answer(o.key)}
              data-testid={`rapid-answer-${o.key}`}
              className="min-h-[44px] rounded-xl px-3 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-slate-200"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Footer: the live tally, and the exit — now a QUIET text button. The old
          magenta-gradient "Stop here" was styled heavier than every answer, so
          the way out outshouted the task; it recedes to where an exit belongs. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setAnswers((prev) => prev.slice(0, -1))}
              data-testid="rapid-back"
              className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-200"
            >
              ← Back
            </button>
          )}
          <p ref={liveRef} aria-live="polite" className="text-xs text-slate-500" data-testid="rapid-live">
            {summary.message}
          </p>
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={() => {
              setDone(true);
              onFinish?.(answers);
            }}
            data-testid="rapid-stop"
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-200"
          >
            Stop here
          </button>
        )}
      </div>
    </div>
  );
}
