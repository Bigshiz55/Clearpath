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

type ActionPayload = { recognition: Recognition; rating?: QuizRating };

/**
 * The four primary responses — one tap, one screen, no step transition. Each maps
 * to an EXISTING Watch DNA engine grade (no engine change). "Haven't seen" is an
 * exposure-only signal (never a taste penalty); "Not sure" (below the grid) is the
 * `unsure` skip.
 */
const ACTIONS: {
  key: string;
  testid: string;
  label: string;
  emoji: string;
  payload: ActionPayload;
  cls: string;
}[] = [
  { key: 'loved', testid: 'rate-loved', label: 'Loved it', emoji: '❤️', payload: { recognition: 'seen', rating: 'loved' }, cls: 'border-rose-400/60 bg-rose-500/15 text-rose-50' },
  { key: 'liked', testid: 'rate-liked', label: 'Liked it', emoji: '👍', payload: { recognition: 'seen', rating: 'liked' }, cls: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-50' },
  { key: 'disliked', testid: 'rate-disliked', label: 'Not for me', emoji: '👎', payload: { recognition: 'seen', rating: 'disliked' }, cls: 'border-amber-400/60 bg-amber-500/15 text-amber-50' },
  { key: 'unseen', testid: 'btn-unseen', label: 'Haven’t seen', emoji: '🍿', payload: { recognition: 'unseen' }, cls: 'border-white/20 bg-white/5 text-white' },
];

function stageLabel(rated: number): string {
  if (rated < 5) return 'Getting started';
  if (rated < 10) return 'Early profile';
  if (rated < 20) return 'Useful profile';
  if (rated < 30) return 'Strong profile';
  return 'Highly refined';
}

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `q_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

/**
 * Watch DNA quiz — single-screen, single-step. Poster, title, and all four
 * response buttons are visible simultaneously with no scrolling and no layout
 * shift (the poster flexes to fit any iPhone viewport). Every answer writes to
 * the real engine via `recordQuizAnswer`; Undo is lossless; completion is
 * adaptive. Never a survey.
 */
export function DnaQuiz({ totalRated = 0, items, onSubmit, onUndo }: Props) {
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [rated, setRated] = useState(totalRated);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);

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
  // Restart the dwell timer on each new title. `status` is intentionally NOT
  // cleared here, so "Saved ✓" persists until the next answer starts.
  useEffect(() => { shownAt.current = Date.now(); }, [idx]);

  const current = queue[idx] ?? null;
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const send = useCallback(
    async (payload: ActionPayload & { dnf?: boolean; reasons?: string[] }) => {
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
    setIdx(last.idx);
    await undo(last.eventId).catch(() => {});
  }, [undo]);

  // ---- full-screen states ------------------------------------------------
  if (loading) {
    return <div data-testid="quiz-loading" className="grid h-full place-items-center text-sm text-slate-400">Loading titles…</div>;
  }
  if (failed && !current) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-slate-300">Couldn’t load titles.</p>
          <button onClick={() => { setFailed(false); void fetchBatch(); }} className="btn-primary mt-4">Try again</button>
        </div>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="grid h-full place-items-center px-6 text-center" data-testid="quiz-done">
        <div>
          <p className="text-xl font-black text-white">That’s a wrap for now 🎬</p>
          <p className="mt-1 text-sm text-slate-400">{rated} rated · {stageLabel(rated)}</p>
          <Link href="/app/watch" className="btn-primary mt-5 inline-flex">See my picks</Link>
        </div>
      </div>
    );
  }

  const meta = [current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden px-3" data-testid="dna-quiz">
      {/* Progress (fixed height) */}
      <div className="flex shrink-0 items-center justify-between pt-1 text-xs text-slate-400">
        <span data-testid="quiz-stage">{rated} rated · {stageLabel(rated)}</span>
        <span className="flex items-center gap-3">
          {rated >= 10 && (
            <Link href="/app/watch" className="font-semibold text-brand-200" data-testid="see-picks">See my picks →</Link>
          )}
          <button
            onClick={() => void undoLast()}
            disabled={history.current.length === 0}
            className="rounded-md px-1.5 py-0.5 font-semibold text-brand-200 disabled:opacity-30"
            aria-label="Undo last answer"
          >
            ↶ Undo
          </button>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 shrink-0 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full bg-brand-400 transition-all duration-300" style={{ width: `${Math.min(100, (rated / 20) * 100)}%` }} />
      </div>

      {/* Poster — the flexible element; shrinks to guarantee one-screen fit */}
      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center">
        {current.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={current.posterUrl}
            src={current.posterUrl}
            alt={current.title}
            className="h-full w-auto max-w-full rounded-2xl border border-white/10 object-contain shadow-lg animate-fade-up"
          />
        ) : (
          <div className="grid h-full w-full max-w-[15rem] place-items-center rounded-2xl border border-white/10 bg-ink-800 p-6 text-center">
            <span className="text-lg font-bold text-slate-200">{current.title}</span>
          </div>
        )}
      </div>

      {/* Title (fixed) */}
      <div className="mt-3 shrink-0 text-center">
        <div data-testid="quiz-title" className="line-clamp-2 text-base font-black leading-tight text-white">{current.title}</div>
        {meta && <div className="mt-0.5 text-xs text-slate-400">{meta}</div>}
      </div>

      {/* Four equal response buttons (fixed) */}
      <div className="mt-3 grid shrink-0 grid-cols-2 gap-2.5" role="group" aria-label="How was it?" data-testid="quiz-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            data-testid={a.testid}
            onClick={() => void send(a.payload)}
            className={`flex min-h-[54px] items-center justify-center gap-2 rounded-2xl border px-3 text-base font-bold transition-transform active:scale-[0.98] ${a.cls}`}
          >
            <span aria-hidden className="text-xl">{a.emoji}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Skip (fixed) */}
      <button onClick={() => void send({ recognition: 'unsure' })} className="mx-auto mt-2 shrink-0 py-1 text-xs font-semibold text-slate-500" data-testid="btn-skip">
        Not sure — skip
      </button>

      {/* Save feedback — fixed height so it never shifts layout */}
      <div className="mb-1 h-4 shrink-0 text-center text-[11px]" aria-live="polite">
        {status === 'saving' && <span className="text-slate-400">Saving…</span>}
        {status === 'saved' && <span className="text-emerald-300" data-testid="save-ok">Saved ✓</span>}
        {status === 'error' && (
          <span className="text-red-300">Couldn’t save. <button onClick={retry} className="underline" data-testid="retry">Retry</button></span>
        )}
      </div>
    </div>
  );
}
