'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { recordQuizAnswer, undoQuizAnswer, addQuizToWatchlist } from '@/lib/actions/dnaQuiz';
import type { QuizRating, Recognition } from '@/lib/preference/quizMap';
import type { AttractionGrade } from '@/lib/preference/types';

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
  /** Pre-watch intent (unseen titles) → Attraction DNA. */
  attraction?: AttractionGrade;
  /** Strong intent: also save to the high-intent watchlist. */
  watchlist?: boolean;
  dnf?: boolean;
  reasons?: string[];
  dwellMs?: number;
}

/** Minimal shape the watchlist chip needs to save a title. */
export interface WatchlistRef {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

interface Props {
  totalRated?: number;
  /** Test/harness override — skip the /api/quiz fetch and use these. */
  items?: QuizItem[];
  /** Override the write path (harness). Defaults to the real server action. */
  onSubmit?: (p: SubmitPayload) => Promise<{ ok: boolean; error?: string }>;
  onUndo?: (eventId: string) => Promise<{ ok: boolean }>;
  /** Override the watchlist-only save (the "Looks good" chip). */
  onWatchlist?: (w: WatchlistRef) => Promise<{ ok: boolean }>;
}

/** Primary decision payload (no rating step, except "Seen it"). */
type PrimaryPayload = Pick<SubmitPayload, 'recognition' | 'attraction' | 'rating' | 'watchlist'>;

/**
 * The four primary actions. Three are one-tap; "Seen it" opens a compact rating
 * sub-state. Intent levels are distinct and never conflated:
 *   Looks Good      → attraction 'interested'   (mild interest, NOT saved)
 *   Add to Watchlist→ attraction 'must_watch' + saved to the high-intent list
 *   Not Interested  → attraction 'not_interested'
 *   Seen It         → opens Loved / Liked / OK / Didn't Like → Experience DNA
 */
const PRIMARY = {
  looksGood: { key: 'looks-good', label: 'Looks Good', emoji: '✨', cls: 'wv-quiz-btn--liked', testid: 'act-looks-good' },
  watchlist: { key: 'watchlist', label: 'Add to Watchlist', emoji: '➕', cls: 'wv-quiz-btn--loved', testid: 'act-watchlist' },
  notInterested: { key: 'not-interested', label: 'Not Interested', emoji: '👎', cls: 'wv-quiz-btn--disliked', testid: 'act-not-interested' },
  seen: { key: 'seen', label: 'Seen It', emoji: '👁️', cls: 'wv-quiz-btn--unseen', testid: 'act-seen' },
} as const;

/** "Seen it" quick-rating choices → Experience grades. */
const RATINGS: { key: QuizRating; label: string; emoji: string; cls: string; testid: string }[] = [
  { key: 'loved', label: 'Loved', emoji: '❤️', cls: 'wv-quiz-btn--loved', testid: 'rate-loved' },
  { key: 'liked', label: 'Liked', emoji: '👍', cls: 'wv-quiz-btn--liked', testid: 'rate-liked' },
  { key: 'okay', label: 'It was OK', emoji: '😐', cls: 'wv-quiz-btn--unseen', testid: 'rate-okay' },
  { key: 'disliked', label: 'Didn’t Like', emoji: '👎', cls: 'wv-quiz-btn--disliked', testid: 'rate-disliked' },
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
 * ONE-TILE discovery quiz. A single self-contained card — progress, artwork,
 * title, and a 2×2 grid of four EQUAL action buttons — that fits the usable
 * mobile viewport (see `.wv-quiz-fit`) with no scrolling. Distinct intent levels
 * feed the real Watch DNA engine via `recordQuizAnswer`. The watchlist stays a
 * deliberate, high-intent list: "Looks Good" never saves; only "Add to
 * Watchlist" (or the optional follow-up chip) does.
 */
export function DnaQuiz({ totalRated = 0, items, onSubmit, onUndo, onWatchlist }: Props) {
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;
  const saveWatchlist = onWatchlist ?? addQuizToWatchlist;
  const isHarness = !!items;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<'primary' | 'rating'>('primary');
  const [answered, setAnswered] = useState(totalRated);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedMsg, setSavedMsg] = useState('Saved ✓');
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [chip, setChip] = useState<{ ref: WatchlistRef; saved: boolean } | null>(null);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef(false);
  const history = useRef<{ eventId: string; idx: number; wasRated: boolean }[]>([]);
  const seen = useRef<Set<string>>(new Set((items ?? []).map((i) => `${i.mediaType}-${i.id}`)));
  const fetching = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Measured, device-agnostic fit (see previous notes): correct the tile height
  // by exactly the document overflow/slack via visualViewport. Only the poster
  // shrinks; the four buttons never leave the screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const fit = () => {
      if (window.innerWidth >= 640 && window.innerHeight >= 640) { el.style.height = ''; el.style.minHeight = ''; return; }
      el.style.minHeight = '0';
      el.style.height = '';
      const vpH = window.visualViewport?.height ?? window.innerHeight;
      const overflow = document.documentElement.scrollHeight - Math.round(vpH);
      const base = el.getBoundingClientRect().height;
      el.style.height = `${Math.max(140, Math.round(base - overflow))}px`;
    };
    fit();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [idx, mode, loading, failed, dry]);

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
  // On each new title: restart dwell timer + always return to the primary step.
  useEffect(() => { shownAt.current = Date.now(); setMode('primary'); }, [idx]);
  useEffect(() => {
    if (isHarness) return;
    try { if (localStorage.getItem('wv_quiz_intro') !== '1') setShowIntro(true); } catch { /* ignore */ }
  }, [isHarness]);

  const current = queue[idx] ?? null;
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const refOf = (it: QuizItem): WatchlistRef => ({
    tmdbId: it.id, mediaType: it.mediaType, title: it.title, year: it.year, posterPath: it.posterPath,
  });

  const send = useCallback(
    async (payload: PrimaryPayload, confirmMsg = 'Saved ✓'): Promise<QuizItem | null> => {
      const c = queue[idx];
      if (!c || busy.current) return null; // no double-submit
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
        if (!res.ok) { setStatus('error'); busy.current = false; return null; }
        history.current.push({ eventId, idx, wasRated: isRated });
        setAnswered((n) => n + 1); // every decision advances progress
        setSavedMsg(confirmMsg);
        setStatus('saved');
        advance();
        return c;
      } catch {
        setStatus('error');
        return null;
      } finally {
        busy.current = false;
      }
    },
    [queue, idx, submit, advance],
  );

  const clearChip = () => { if (chipTimer.current) clearTimeout(chipTimer.current); setChip(null); };

  // Looks Good: mild interest, NOT saved. Offer a brief, non-blocking chip that
  // lets the user upgrade the JUST-answered title to the watchlist if they want.
  const onLooksGood = useCallback(async () => {
    const answered = await send({ recognition: 'unseen', attraction: 'interested' }, 'Looks good ✓');
    if (!answered) return;
    if (chipTimer.current) clearTimeout(chipTimer.current);
    setChip({ ref: refOf(answered), saved: false });
    chipTimer.current = setTimeout(() => setChip(null), 5000);
  }, [send]);

  const onAddWatchlist = useCallback(async () => {
    clearChip();
    await send({ recognition: 'unseen', attraction: 'must_watch', watchlist: true }, 'Added to watchlist ✓');
  }, [send]);

  const onNotInterested = useCallback(async () => {
    clearChip();
    await send({ recognition: 'unseen', attraction: 'not_interested' }, 'Got it ✓');
  }, [send]);

  const onRate = useCallback(async (rating: QuizRating) => {
    clearChip();
    await send({ recognition: 'seen', rating }, 'Saved ✓');
  }, [send]);

  // Chip → save the previous "Looks Good" title to the watchlist (no 2nd DNA event).
  const chipSave = useCallback(async () => {
    if (!chip) return;
    setChip({ ...chip, saved: true });
    await saveWatchlist(chip.ref).catch(() => {});
    if (chipTimer.current) clearTimeout(chipTimer.current);
    chipTimer.current = setTimeout(() => setChip(null), 1500);
  }, [chip, saveWatchlist]);

  const retry = () => setStatus('idle');

  const undoLast = useCallback(async () => {
    const last = history.current.pop();
    if (!last) return;
    clearChip();
    setAnswered((n) => Math.max(0, n - 1));
    setStatus('idle');
    setIdx(last.idx);
    await undo(last.eventId).catch(() => {});
  }, [undo]);

  const dismissIntro = () => {
    setShowIntro(false);
    try { localStorage.setItem('wv_quiz_intro', '1'); } catch { /* ignore */ }
  };

  // ---- non-card states -----------------------------------------------------
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
        <p className="mt-1 text-sm text-slate-400">{answered} sorted · {stageLabel(answered)}</p>
        <Link href="/app/watch" className="btn-primary mt-5 inline-flex">See my picks</Link>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="wv-quiz-fit mx-auto flex w-full max-w-md flex-col gap-2" data-testid="dna-quiz">
      {/* 1 · Compact progress + Undo */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-slate-300" data-testid="quiz-stage">
          {answered} sorted · <span className="text-brand-200">{stageLabel(answered)}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setShowIntro(true)} className="rounded-md px-1.5 py-1 text-slate-500 hover:text-slate-300" aria-label="How this works">ⓘ</button>
          <button
            onClick={() => void undoLast()}
            disabled={history.current.length === 0}
            className="rounded-md px-2 py-1 font-semibold text-brand-200 disabled:opacity-30"
            aria-label="Undo last answer"
          >↶ Undo</button>
        </div>
      </div>

      {/* 2 · Artwork (only element allowed to shrink) */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-ink-900" data-testid="quiz-poster">
        {current.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.posterUrl} alt={current.title} className="mx-auto h-full w-full object-contain object-center" />
        ) : (
          <div className="grid h-full w-full place-items-center p-4 text-center">
            <span className="text-lg font-bold text-slate-200">{current.title}</span>
          </div>
        )}
        {/* Save state overlays the poster → no layout shift */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2" aria-live="polite">
          {status === 'saving' && <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-slate-200">Saving…</span>}
          {status === 'saved' && <span className="rounded-full bg-emerald-600/85 px-2.5 py-0.5 text-xs font-semibold text-white" data-testid="save-ok">{savedMsg}</span>}
          {status === 'error' && (
            <span className="pointer-events-auto rounded-full bg-red-600/85 px-2.5 py-0.5 text-xs font-semibold text-white">
              Couldn’t save · <button onClick={retry} className="underline" data-testid="retry">Retry</button>
            </span>
          )}
        </div>
        {/* Non-blocking "Looks good → Add to Watchlist" chip (previous title) */}
        {chip && (
          <div className="absolute inset-x-0 top-0 flex justify-center pt-2" data-testid="lg-chip">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-ink-950/90 px-3 py-1 text-xs shadow-card backdrop-blur">
              <span className="text-slate-300">Looks good</span>
              {chip.saved ? (
                <span className="font-semibold text-emerald-300">On your list ✓</span>
              ) : (
                <button onClick={() => void chipSave()} className="font-bold text-brand-200" data-testid="lg-chip-add">+ Watchlist</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3 · Title + year/type */}
      <div className="shrink-0">
        <div data-testid="quiz-title" className="line-clamp-2 text-center text-base font-black leading-tight text-white">{current.title}</div>
        <div className="mt-0.5 text-center text-xs text-slate-400">
          {[current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* 4 · Four equal buttons — primary actions, or the "Seen it" rating step */}
      {mode === 'primary' ? (
        <div className="wv-quiz-grid shrink-0" data-testid="quiz-grid" role="group" aria-label="What do you think of this title?">
          <button onClick={() => void onLooksGood()} className={`wv-quiz-btn ${PRIMARY.looksGood.cls}`} data-testid={PRIMARY.looksGood.testid}>
            <span aria-hidden className="wv-quiz-emoji">{PRIMARY.looksGood.emoji}</span>{PRIMARY.looksGood.label}
          </button>
          <button onClick={() => void onAddWatchlist()} className={`wv-quiz-btn ${PRIMARY.watchlist.cls}`} data-testid={PRIMARY.watchlist.testid}>
            <span aria-hidden className="wv-quiz-emoji">{PRIMARY.watchlist.emoji}</span>{PRIMARY.watchlist.label}
          </button>
          <button onClick={() => void onNotInterested()} className={`wv-quiz-btn ${PRIMARY.notInterested.cls}`} data-testid={PRIMARY.notInterested.testid}>
            <span aria-hidden className="wv-quiz-emoji">{PRIMARY.notInterested.emoji}</span>{PRIMARY.notInterested.label}
          </button>
          <button onClick={() => { clearChip(); setMode('rating'); }} className={`wv-quiz-btn ${PRIMARY.seen.cls}`} data-testid={PRIMARY.seen.testid}>
            <span aria-hidden className="wv-quiz-emoji">{PRIMARY.seen.emoji}</span>{PRIMARY.seen.label}
          </button>
        </div>
      ) : (
        <div className="shrink-0" data-testid="rating-step">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">How was it?</span>
            <button onClick={() => setMode('primary')} className="text-xs font-semibold text-slate-400" data-testid="rate-back">← Back</button>
          </div>
          <div className="wv-quiz-grid" role="group" aria-label="Rate this title">
            {RATINGS.map((r) => (
              <button key={r.key} onClick={() => void onRate(r.key)} className={`wv-quiz-btn ${r.cls}`} data-testid={r.testid}>
                <span aria-hidden className="wv-quiz-emoji">{r.emoji}</span>{r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* One-time "how it works" sheet */}
      {showIntro && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 sm:items-center" data-testid="quiz-intro">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 text-center shadow-card">
            <h2 className="text-lg font-black text-white">🧬 Build your Watch DNA</h2>
            <p className="mt-2 text-left text-sm text-slate-300">
              For each title, tap one:
            </p>
            <ul className="mt-1 space-y-1 text-left text-sm text-slate-300">
              <li>✨ <b>Looks Good</b> — mild interest (won’t save it)</li>
              <li>➕ <b>Add to Watchlist</b> — you want to watch it</li>
              <li>👎 <b>Not Interested</b> — not for you</li>
              <li>👁️ <b>Seen It</b> — rate how it was</li>
            </ul>
            <button onClick={dismissIntro} className="btn-primary mt-4 w-full" data-testid="quiz-intro-dismiss">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
