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
import {
  answersFor,
  questionFor,
  resolveAnswer,
  summarise,
  type AnswerKey,
  type RapidFireItem,
} from '@/lib/import/rapidFire';

const TONE: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
  bad: 'border-rose-400/50 bg-rose-500/15 text-rose-100',
  neutral: 'border-white/20 bg-white/[0.07] text-slate-200',
};

const KIND_BADGE: Record<RapidFireItem['kind'], { label: string; className: string }> = {
  abandoned: { label: 'You stopped watching', className: 'border-amber-400/50 bg-amber-500/15 text-amber-100' },
  rewatched: { label: 'You went back to it', className: 'border-[#ff1493]/50 bg-[#ff1493]/15 text-pink-100' },
  watched: { label: 'You watched it', className: 'border-white/20 bg-white/10 text-slate-300' },
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
    <div className="relative aspect-[2/3] w-28 flex-none overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/50 sm:w-36">
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
}: {
  queue: RapidFireItem[];
  onAnswer?: (item: RapidFireItem, answer: AnswerKey) => void;
  onFinish?: (answers: AnswerKey[]) => void;
  notice?: React.ReactNode;
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
        <div className="text-xs font-black uppercase tracking-[0.15em] text-[#ff1493]">Done for now</div>
        <h2 className="mt-1 text-2xl font-black text-white">{summary.message}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          {summary.taught > 0
            ? `Those ${summary.taught} are worth far more than the rows they replaced — an opinion you stated counts for five to eight times what "you pressed play" does.`
            : 'Nothing was recorded, which is the right outcome when you could not remember them.'}
        </p>
        {summary.remaining > 0 && (
          <button
            type="button"
            onClick={() => setDone(false)}
            data-testid="rapid-continue"
            className="btn-primary mt-4 inline-flex min-h-[44px] items-center px-5"
          >
            Keep going — {summary.remaining} left →
          </button>
        )}
      </div>
    );
  }

  const options = answersFor(item.kind);
  const badge = KIND_BADGE[item.kind];

  return (
    <div data-testid="rapid-fire">
      {notice}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-400" data-testid="rapid-progress">
          {index + 1} of {queue.length}
        </div>
        {index > 0 && (
          <button
            type="button"
            onClick={() => setAnswers((prev) => prev.slice(0, -1))}
            data-testid="rapid-back"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
          >
            ← Back
          </button>
        )}
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#ff1493] transition-all"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>

      <div className="card mt-4 p-4 sm:p-5" data-testid={`rapid-card-${item.key}`}>
        <div className="flex gap-4">
          <Cover item={item} />
          <div className="min-w-0 flex-1">
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.className}`}
              data-testid="rapid-kind"
            >
              {badge.label}
            </span>
            <h2 className="mt-1.5 text-xl font-black leading-tight text-white sm:text-2xl">{item.title}</h2>
            {/* Straight from the file. This is what makes the question answerable. */}
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400" data-testid="rapid-evidence">
              {item.evidence}
            </p>
          </div>
        </div>

        <p className="mt-4 text-base font-bold text-white" data-testid="rapid-question">
          {questionFor(item)}
        </p>

        {/* 2-up so six answers never overflow a 320px screen. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options.map((o, i) => (
            <button
              key={o.key}
              type="button"
              onClick={() => answer(o.key)}
              data-testid={`rapid-answer-${o.key}`}
              className={`min-h-[56px] rounded-xl border-2 px-2 text-sm font-bold transition hover:brightness-125 sm:text-base ${TONE[o.tone]}`}
            >
              <span className="mr-1 hidden text-[10px] opacity-50 sm:inline">{i + 1}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p ref={liveRef} aria-live="polite" className="text-xs text-slate-500" data-testid="rapid-live">
          {summary.message}
        </p>
        {index > 0 && (
          <button
            type="button"
            onClick={() => {
              setDone(true);
              onFinish?.(answers);
            }}
            data-testid="rapid-stop"
            className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-pink-200/60 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] px-5 text-sm font-black text-white transition hover:brightness-110"
          >
            Stop here
          </button>
        )}
      </div>
    </div>
  );
}
