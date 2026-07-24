'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { recordQuizAnswer, undoQuizAnswer } from '@/lib/actions/dnaQuiz';
import type { QuizRating, Recognition } from '@/lib/preference/quizMap';

export interface QuizItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  genre?: string | null;
}

export interface SubmitPayload {
  eventId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  recognition: Recognition;
  rating?: QuizRating;
  dnf?: boolean;
  reasons?: string[];
  dwellMs?: number;
}

interface Props {
  totalRated?: number;
  /** Test/harness override — skip the /api/quiz fetch and use these. */
  items?: QuizItem[];
  /** Override the write path (harness). Defaults to the real server action. */
  onSubmit?: (p: SubmitPayload) => Promise<{ ok: boolean; error?: string }>;
  onUndo?: (eventId: string) => Promise<{ ok: boolean }>;
}

/**
 * The four visible choices. Each maps directly into the existing Watch DNA
 * model — no extra step, one tap records the opinion:
 *   Loved it       → seen + loved     (strong positive)
 *   Liked it       → seen + liked      (positive)
 *   Didn't like it → seen + disliked   (negative)
 *   Haven't seen it→ unseen            (exposure only, zero DNA penalty)
 * The richer 5-level grades (okay / hated / dnf) still exist in the engine and
 * elsewhere; the quiz just doesn't surface them, keeping the decision fast.
 */
type Choice = {
  key: string;
  label: string;
  emoji: string;
  cls: string;
  testid: string;
  payload: Omit<SubmitPayload, 'eventId' | 'tmdbId' | 'mediaType' | 'title' | 'year' | 'posterPath' | 'dwellMs'>;
};
const CHOICES: Choice[] = [
  { key: 'loved', label: 'Loved it', emoji: '❤️', cls: 'wv-quiz-btn--loved', testid: 'rate-loved', payload: { recognition: 'seen', rating: 'loved' } },
  { key: 'liked', label: 'Liked it', emoji: '👍', cls: 'wv-quiz-btn--liked', testid: 'rate-liked', payload: { recognition: 'seen', rating: 'liked' } },
  { key: 'disliked', label: 'Didn’t like it', emoji: '👎', cls: 'wv-quiz-btn--disliked', testid: 'rate-disliked', payload: { recognition: 'seen', rating: 'disliked' } },
  { key: 'unseen', label: 'Haven’t seen it', emoji: '🤔', cls: 'wv-quiz-btn--unseen', testid: 'rate-unseen', payload: { recognition: 'unseen' } },
];

function stageLabel(rated: number): string {
  if (rated < 5) return 'DNA warming up';
  if (rated < 10) return 'DNA getting sharper';
  if (rated < 20) return 'DNA taking shape';
  if (rated < 30) return 'DNA looking strong';
  return 'DNA highly refined';
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `q_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

/**
 * ONE-TILE two-choice-grid quiz. Every title is a single self-contained card —
 * compact progress row, artwork, title, and a 2×2 grid of four equal buttons —
 * that fits inside the usable mobile viewport (see `.wv-quiz-fit`) with no
 * scrolling and nothing hidden behind the bottom nav. One tap records straight
 * into the real Watch DNA engine via `recordQuizAnswer`. Undo + adaptive
 * completion preserved from the original engine; no second quiz system.
 */
export function DnaQuiz({ totalRated = 0, items, onSubmit, onUndo }: Props) {
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;
  const isHarness = !!items;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [rated, setRated] = useState(totalRated);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef(false);
  const history = useRef<{ eventId: string; idx: number; wasRated: boolean }[]>([]);
  const seen = useRef<Set<string>>(new Set((items ?? []).map((i) => `${i.mediaType}-${i.id}`)));
  const fetching = useRef(false);

  const fetchBatch = useCallback(async () => {
    if (items || fetching.current || dry) return;
    fetching.current = true;
    try {
      const r = await fetch('/api/quiz', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) { setFailed(true); return; }
      const fresh: QuizItem[] = (d.items ?? []).filter((it: QuizItem) => !seen.current.has(`${it.mediaType}-${it.id}`));
      fresh.forEach((it) => seen.current.add(`${it.mediaType}-${it.id}`));
      if (fresh.length === 0) setDry(true);
      else setQueue((q) => [...q, ...fresh]);
    } catch {
      setFailed(true);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [items, dry]);

  useEffect(() => { void fetchBatch(); }, [fetchBatch]);
  useEffect(() => { if (!items && queue.length - idx <= 5 && !failed) void fetchBatch(); }, [items, idx, queue.length, failed, fetchBatch]);
  // On each new title: restart the dwell timer. Do NOT clear `status` here — the
  // "Saved ✓" confirmation should persist until the next answer starts saving.
  useEffect(() => { shownAt.current = Date.now(); }, [idx]);
  // First-ever visit: show the one-time "how it works" sheet (real route only).
  useEffect(() => {
    if (isHarness) return;
    try {
      if (localStorage.getItem('wv_quiz_intro') !== '1') setShowIntro(true);
    } catch { /* private mode — just skip */ }
  }, [isHarness]);

  const current = queue[idx] ?? null;
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const send = useCallback(
    async (payload: Choice['payload']) => {
      const c = queue[idx];
      if (!c || busy.current) return; // no double-submit
      busy.current = true;
      const eventId = uid();
      const isRated = payload.recognition === 'seen';
      setStatus('saving');
      const full: SubmitPayload = {
        eventId,
        tmdbId: c.id,
        mediaType: c.mediaType,
        title: c.title,
        year: c.year,
        posterPath: c.posterPath,
        dwellMs: Date.now() - shownAt.current,
        ...payload,
      };
      try {
        const res = await submit(full);
        if (!res.ok) { setStatus('error'); busy.current = false; return; }
        history.current.push({ eventId, idx, wasRated: isRated });
        if (isRated) setRated((n) => n + 1);
        setStatus('saved');
        advance();
      } catch {
        setStatus('error');
      } finally {
        busy.current = false;
      }
    },
    [queue, idx, submit, advance],
  );

  const retry = () => setStatus('idle');

  const undoLast = useCallback(async () => {
    const last = history.current.pop();
    if (!last) return;
    if (last.wasRated) setRated((n) => Math.max(0, n - 1));
    setStatus('idle');
    setIdx(last.idx);
    await undo(last.eventId).catch(() => {});
  }, [undo]);

  const dismissIntro = () => {
    setShowIntro(false);
    try { localStorage.setItem('wv_quiz_intro', '1'); } catch { /* ignore */ }
  };

  // ---- non-card states (kept inside the fit box so nothing scrolls) --------
  if (loading) {
    return (
      <div className="wv-quiz-fit mx-auto flex max-w-md items-center justify-center" data-testid="quiz-loading">
        <span className="text-slate-400">Loading titles…</span>
      </div>
    );
  }
  if (failed && !current) {
    return (
      <div className="wv-quiz-fit mx-auto flex max-w-md flex-col items-center justify-center text-center">
        <p className="text-slate-300">Couldn’t load titles.</p>
        <button onClick={() => { setFailed(false); void fetchBatch(); }} className="btn-primary mt-4">Try again</button>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="wv-quiz-fit mx-auto flex max-w-md flex-col items-center justify-center text-center" data-testid="quiz-done">
        <p className="text-xl font-black text-white">That’s a wrap for now 🎬</p>
        <p className="mt-1 text-sm text-slate-400">{rated} rated · {stageLabel(rated)}</p>
        <Link href="/app/watch" className="btn-primary mt-5 inline-flex">See my picks</Link>
      </div>
    );
  }

  return (
    <div className="wv-quiz-fit mx-auto flex w-full max-w-md flex-col gap-2" data-testid="dna-quiz">
      {/* 1 · Compact progress + Undo (one line) */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-slate-300" data-testid="quiz-stage">
          {rated} rated · <span className="text-brand-200">{stageLabel(rated)}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setShowIntro(true)}
            className="rounded-md px-1.5 py-1 text-slate-500 hover:text-slate-300"
            aria-label="How this works"
          >ⓘ</button>
          <button
            onClick={() => void undoLast()}
            disabled={history.current.length === 0}
            className="rounded-md px-2 py-1 font-semibold text-brand-200 disabled:opacity-30"
            aria-label="Undo last answer"
          >↶ Undo</button>
        </div>
      </div>

      {/* 2 · Artwork — the only element allowed to shrink. object-contain keeps
             the whole poster (and its title text) recognizable at any size. */}
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-ink-900"
        data-testid="quiz-poster"
      >
        {current.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.posterUrl}
            alt={current.title}
            className="mx-auto h-full w-full object-contain object-center"
          />
        ) : (
          <div className="grid h-full w-full place-items-center p-4 text-center">
            <span className="text-lg font-bold text-slate-200">{current.title}</span>
          </div>
        )}
        {/* Save state overlays the poster so it never shifts the layout. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2" aria-live="polite">
          {status === 'saving' && <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-slate-200">Saving…</span>}
          {status === 'saved' && <span className="rounded-full bg-emerald-600/80 px-2.5 py-0.5 text-xs font-semibold text-white" data-testid="save-ok">Saved ✓</span>}
          {status === 'error' && (
            <span className="pointer-events-auto rounded-full bg-red-600/85 px-2.5 py-0.5 text-xs font-semibold text-white">
              Couldn’t save · <button onClick={retry} className="underline" data-testid="retry">Retry</button>
            </span>
          )}
        </div>
      </div>

      {/* 3 · Title + year/type (compact, always visible) */}
      <div className="shrink-0">
        <div data-testid="quiz-title" className="line-clamp-2 text-center text-base font-black leading-tight text-white">
          {current.title}
        </div>
        <div className="mt-0.5 text-center text-xs text-slate-400">
          {[current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* 4 · Four equal buttons — 2×2 grid, single-tap records the opinion */}
      <div className="grid shrink-0 grid-cols-2 gap-2" data-testid="quiz-grid" role="group" aria-label="Rate this title">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            onClick={() => void send(c.payload)}
            className={`wv-quiz-btn ${c.cls}`}
            data-testid={c.testid}
          >
            <span aria-hidden className="wv-quiz-emoji">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* One-time "how it works" sheet — explanation lives here, NOT on every card */}
      {showIntro && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="quiz-intro">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 text-center shadow-card">
            <h2 className="text-lg font-black text-white">🧬 Build your Watch DNA</h2>
            <p className="mt-2 text-sm text-slate-300">
              For each title, tap how you feel — <b>Loved it</b>, <b>Liked it</b>, or <b>Didn’t like it</b>.
              Not seen it? Tap <b>Haven’t seen it</b> — it’s skipped and never counts against you.
              Every answer sharpens your recommendations. Stop anytime.
            </p>
            <button onClick={dismissIntro} className="btn-primary mt-4 w-full" data-testid="quiz-intro-dismiss">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
