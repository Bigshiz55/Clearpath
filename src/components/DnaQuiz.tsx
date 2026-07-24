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

const RATINGS: { key: QuizRating; label: string; emoji: string; cls: string }[] = [
  { key: 'loved', label: 'Loved it', emoji: '❤️', cls: 'border-rose-400/60 bg-rose-500/15 text-rose-50' },
  { key: 'liked', label: 'Liked it', emoji: '👍', cls: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-50' },
  { key: 'okay', label: 'It was okay', emoji: '😐', cls: 'border-slate-400/50 bg-white/5 text-slate-100' },
  { key: 'disliked', label: 'Didn’t like it', emoji: '👎', cls: 'border-amber-400/60 bg-amber-500/15 text-amber-50' },
  { key: 'hated', label: 'Hated it', emoji: '🚫', cls: 'border-red-500/60 bg-red-600/15 text-red-50' },
];

const DNF_REASONS = ['Too slow', 'Too dark', 'Lost interest', 'Not in the mood', 'Other'];

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
 * The redesigned two-step quiz. Step 1: "Have you seen this?" — Seen it / Haven't
 * seen it / Not sure. Step 2 (only after Seen it): a fast rating that reveals in
 * place. Haven't-seen is exposure only (no taste penalty); every answer writes to
 * the real Watch DNA engine via `recordQuizAnswer`. Mobile-first, Undo, adaptive
 * completion — never a survey.
 */
export function DnaQuiz({ totalRated = 0, items, onSubmit, onUndo }: Props) {
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<'recognition' | 'rating' | 'dnf'>('recognition');
  const [rated, setRated] = useState(totalRated);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const [keepGoingDismissed, setKeepGoingDismissed] = useState(false);

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
  // On each new title: reset to the recognition step and restart the dwell timer.
  // Do NOT clear `status` here — otherwise the "Saved ✓" confirmation is wiped the
  // instant we advance; it persists until the next answer starts ('saving').
  useEffect(() => { shownAt.current = Date.now(); setStep('recognition'); }, [idx]);

  const current = queue[idx] ?? null;

  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const send = useCallback(
    async (payload: Omit<SubmitPayload, 'eventId' | 'tmdbId' | 'mediaType' | 'title' | 'year' | 'posterPath' | 'dwellMs'>) => {
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

  // ---- states -------------------------------------------------------------
  if (loading) {
    return <div data-testid="quiz-loading" className="mx-auto max-w-md py-16 text-center text-slate-400">Loading titles…</div>;
  }
  if (failed && !current) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-slate-300">Couldn’t load titles.</p>
        <button onClick={() => { setFailed(false); void fetchBatch(); }} className="btn-primary mt-4">Try again</button>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="mx-auto max-w-md py-16 text-center" data-testid="quiz-done">
        <p className="text-xl font-black text-white">That’s a wrap for now 🎬</p>
        <p className="mt-1 text-sm text-slate-400">{rated} rated · {stageLabel(rated)}</p>
        <Link href="/app/watch" className="btn-primary mt-5 inline-flex">See my picks</Link>
      </div>
    );
  }

  const showKeepGoing = rated >= 10 && !keepGoingDismissed;

  return (
    <div className="mx-auto w-full max-w-md px-1 pb-24" data-testid="dna-quiz">
      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span data-testid="quiz-stage">{rated} rated · {stageLabel(rated)}</span>
          <button onClick={() => void undoLast()} disabled={history.current.length === 0} className="rounded-md px-2 py-1 font-semibold text-brand-200 disabled:opacity-30" aria-label="Undo last answer">↶ Undo</button>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full bg-brand-400 transition-all" style={{ width: `${Math.min(100, (rated / 20) * 100)}%` }} />
        </div>
      </div>

      {/* Poster + title */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
        <div className="relative aspect-[2/3] w-full bg-ink-800">
          {current.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.posterUrl} alt={current.title} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center p-6 text-center">
              <span className="text-lg font-bold text-slate-200">{current.title}</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div data-testid="quiz-title" className="line-clamp-2 text-base font-black leading-tight text-white">{current.title}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {[current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* Step 1 — recognition */}
      {step === 'recognition' && (
        <div className="mt-4 space-y-2.5" data-testid="step-recognition">
          <p className="text-center text-sm font-semibold text-slate-300">Have you seen this?</p>
          <button onClick={() => setStep('rating')} className="wv-cta-3d min-h-[52px] w-full text-lg" data-testid="btn-seen">Seen it</button>
          <button
            onClick={() => void send({ recognition: 'unseen' })}
            className="min-h-[52px] w-full rounded-2xl border border-white/20 bg-white/5 text-lg font-bold text-white active:scale-[0.99]"
            data-testid="btn-unseen"
          >
            Haven’t seen it
          </button>
          <button onClick={() => void send({ recognition: 'unsure' })} className="min-h-[44px] w-full text-sm font-semibold text-slate-400" data-testid="btn-skip">
            Not sure — skip
          </button>
        </div>
      )}

      {/* Step 2 — rating (revealed after Seen it) */}
      {step === 'rating' && (
        <div className="mt-4 animate-fade-up space-y-2" data-testid="step-rating">
          <p className="text-center text-sm font-semibold text-slate-300">How was it?</p>
          <div className="grid grid-cols-1 gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.key}
                onClick={() => void send({ recognition: 'seen', rating: r.key })}
                className={`flex min-h-[48px] items-center gap-3 rounded-2xl border px-4 text-base font-bold active:scale-[0.99] ${r.cls}`}
                data-testid={`rate-${r.key}`}
              >
                <span aria-hidden className="text-xl">{r.emoji}</span>{r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setStep('dnf')} className="text-xs font-semibold text-slate-400 underline-offset-2 hover:underline" data-testid="btn-dnf">
              I didn’t finish it
            </button>
            <button onClick={() => setStep('recognition')} className="text-xs font-semibold text-slate-500">← Back</button>
          </div>
        </div>
      )}

      {/* Optional DNF follow-up (one question) */}
      {step === 'dnf' && (
        <div className="mt-4 animate-fade-up space-y-2" data-testid="step-dnf">
          <p className="text-center text-sm font-semibold text-slate-300">What made you stop?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {DNF_REASONS.map((label) => (
              <button
                key={label}
                onClick={() => void send({ recognition: 'seen', rating: 'disliked', dnf: true, reasons: [label.toLowerCase().replace(/[^a-z]+/g, '_')] })}
                className="min-h-[40px] rounded-full border border-white/15 bg-white/5 px-3 text-sm font-semibold text-slate-200 active:scale-95"
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => void send({ recognition: 'seen', rating: 'disliked', dnf: true })}
              className="min-h-[40px] rounded-full border border-brand-300/40 px-3 text-sm font-semibold text-brand-200"
            >
              Just skip
            </button>
          </div>
        </div>
      )}

      {/* Save feedback / error */}
      <div className="mt-3 text-center text-xs" aria-live="polite">
        {status === 'saving' && <span className="text-slate-400">Saving…</span>}
        {status === 'saved' && <span className="text-emerald-300" data-testid="save-ok">Saved ✓</span>}
        {status === 'error' && (
          <span className="text-red-300">Couldn’t save. <button onClick={retry} className="underline" data-testid="retry">Retry</button></span>
        )}
      </div>

      {/* Adaptive completion */}
      {showKeepGoing && (
        <div className="mt-4 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-3 text-center" data-testid="keep-going">
          <p className="text-sm font-semibold text-white">You’ve got a {stageLabel(rated).toLowerCase()} — nice.</p>
          <div className="mt-2 flex justify-center gap-2">
            <Link href="/app/watch" className="btn-primary">See my picks</Link>
            <button onClick={() => setKeepGoingDismissed(true)} className="btn-secondary">Keep going</button>
          </div>
        </div>
      )}
    </div>
  );
}
