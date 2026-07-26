'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { recordQuizAnswer, undoQuizAnswer } from '@/lib/actions/dnaQuiz';
import type { QuizRating, Recognition } from '@/lib/preference/quizMap';
import type { AttractionGrade } from '@/lib/preference/types';
import { computeDnaConfidence, emptyTally, type DnaSignalTally } from '@/lib/preference/dnaConfidence';
import { calibrationProgress, CALIBRATION_SIZE, EARLY_COMPLETE } from '@/lib/preference/calibration';

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
  attraction?: AttractionGrade;
  watchlist?: boolean;
  dnf?: boolean;
  reasons?: string[];
  dwellMs?: number;
  source?: string;
  sessionId?: string;
}

/** How the finite flow is configured — onboarding calibration vs an optional pack. */
export interface CalibrationConfig {
  /** Total titles in this finite flow (20 onboarding · pack size for packs). */
  total: number;
  /** Answers already recorded for this flow (resume). */
  answered: number;
  /** Show the onboarding "Quiz Progress" metric (false for packs). */
  showQuizProgress: boolean;
  /** Show a "starter DNA ready" checkpoint after this many (onboarding = 10). */
  checkpointAt?: number;
  /** Event source tag: 'calibration' | 'pack:<key>'. */
  source: string;
  /** API endpoint returning { items, answered, size, complete }. */
  endpoint: string;
  /** Founder test session id (isolates events), if any. */
  sessionId?: string;
  /** Where "See Recommendations" / done goes. */
  doneHref?: string;
  /** Human label for the flow (e.g. "Comedy pack"). */
  label?: string;
}

interface Props {
  /** Server-computed signal snapshot so DNA Confidence starts at the real value. */
  initialTally?: DnaSignalTally;
  /** Finite-flow config. When omitted, defaults to onboarding calibration. */
  calibration?: CalibrationConfig;
  /** Test harness: preloaded items + injected handlers. */
  items?: QuizItem[];
  onSubmit?: (p: SubmitPayload) => Promise<{ ok: boolean; error?: string }>;
  onUndo?: (eventId: string) => Promise<{ ok: boolean }>;
}

type PrimaryPayload = Pick<SubmitPayload, 'recognition' | 'attraction' | 'rating' | 'watchlist'>;

const ICONS = {
  star: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95L12 2.5z" />
    </svg>
  ),
  bookmark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
      <path d="M6 3.5h12a1 1 0 011 1V21l-7-4-7 4V4.5a1 1 0 011-1z" fill="currentColor" fillOpacity="0.18" />
    </svg>
  ),
  skip: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
      <path d="M5 5l8 7-8 7V5zm9 0h2.4v14H14V5z" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
} as const;

/**
 * THREE actions. Save is deliberately absent.
 *
 * The quiz exists to learn taste; the Watchlist stores viewing intent. Mixing
 * them made "Looks Good" and "Save" compete for the same reaction, and a tap
 * meant to teach us something silently created a watchlist record. Saving lives
 * on search results, title pages, recommendation cards and On TV — everywhere a
 * user is actually deciding what to watch, rather than telling us who they are.
 */
const PRIMARY = {
  looksGood: { label: 'Looks Good', icon: ICONS.star, cls: 'wv-quiz-btn--liked', testid: 'act-looks-good' },
  skip: { label: 'Skip', icon: ICONS.skip, cls: 'wv-quiz-btn--nope', testid: 'act-skip' },
  seen: { label: 'Seen It', icon: ICONS.eye, cls: 'wv-quiz-btn--seen', testid: 'act-seen' },
} as const;

const RATINGS: { key: QuizRating; label: string; emoji: string; cls: string; testid: string }[] = [
  { key: 'loved', label: 'Loved It', emoji: '❤️', cls: 'wv-quiz-btn--loved', testid: 'rate-loved' },
  { key: 'liked', label: 'Liked It', emoji: '👍', cls: 'wv-quiz-btn--liked', testid: 'rate-liked' },
  { key: 'okay', label: 'It Was Okay', emoji: '😐', cls: 'wv-quiz-btn--unseen', testid: 'rate-okay' },
  { key: 'disliked', label: 'Didn’t Like It', emoji: '👎', cls: 'wv-quiz-btn--disliked', testid: 'rate-disliked' },
];

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `q_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

const DEFAULT_CAL: CalibrationConfig = {
  total: CALIBRATION_SIZE,
  answered: 0,
  showQuizProgress: true,
  checkpointAt: EARLY_COMPLETE,
  source: 'calibration',
  endpoint: '/api/calibration',
  doneHref: '/app/watch',
  label: 'Watch DNA calibration',
};

function fmtEta(seconds: number): string {
  if (seconds <= 0) return 'done';
  if (seconds < 60) return `~${seconds}s left`;
  const m = Math.round(seconds / 60);
  return `~${m} min left`;
}

/**
 * FINITE cinematic Watch-DNA calibration. Two SEPARATE metrics are always
 * distinct:
 *   • Quiz Progress   — how far through the finite N-title onboarding (X of 20).
 *   • Watch DNA Confidence — how well we understand you, from diverse real
 *     signals; it never mirrors Quiz Progress and never hits 100 from answers
 *     alone.
 * After the checkpoint (10) we offer to stop with a starter DNA; at the total
 * (20) onboarding ends — we never present an endless feed.
 */
export function DnaQuiz({ initialTally, calibration, items, onSubmit, onUndo }: Props) {
  const cal = calibration ?? DEFAULT_CAL;
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;
  const isHarness = !!items;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<'primary' | 'rating'>('primary');
  const [answered, setAnswered] = useState(cal.answered);
  const [tally, setTally] = useState<DnaSignalTally>(initialTally ?? emptyTally());
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [serverComplete, setServerComplete] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [checkpointDismissed, setCheckpointDismissed] = useState(false);
  const [finishedLater, setFinishedLater] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef(false);
  const history = useRef<{ eventId: string; idx: number }[]>([]);
  const seen = useRef<Set<string>>(new Set((items ?? []).map((i) => `${i.mediaType}-${i.id}`)));
  const fetching = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The two metrics — computed independently.
  const progress = useMemo(() => calibrationProgress(answered, cal.total), [answered, cal.total]);
  const confidence = useMemo(() => computeDnaConfidence(tally).percent, [tally]);
  const complete = serverComplete || answered >= cal.total;
  const atCheckpoint =
    !isHarness && cal.checkpointAt != null && answered >= cal.checkpointAt && answered < cal.total && !checkpointDismissed;

  // Measured, device-agnostic fit — only the poster shrinks (unchanged logic).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const fit = () => {
      if (window.innerWidth >= 640 && window.innerHeight >= 640) { el.style.height = ''; el.style.minHeight = ''; return; }
      // Fill the free space as a *minimum*, never a fixed cap: the poster keeps a
      // guaranteed min-height (CSS), so if a short iOS viewport (Safari chrome
      // expanded) makes this measurement small, the tile GROWS to fit the poster
      // instead of squeezing it to a thumbnail. A little scroll on tiny screens
      // beats a collapsed poster — which was the real on-device bug.
      el.style.height = '';
      const vpH = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const main = el.closest('main');
      const outer = main?.parentElement ?? null;
      const pb = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).paddingBottom) || 0 : 0);
      const reserveBelow = pb(main) + pb(outer);
      el.style.minHeight = `${Math.max(180, Math.round(vpH - top - reserveBelow))}px`;
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
  }, [idx, mode, loading, failed, complete, atCheckpoint]);

  const fetchBatch = useCallback(async () => {
    if (items || fetching.current) return;
    fetching.current = true;
    try {
      const sep = cal.endpoint.includes('?') ? '&' : '?';
      const url = cal.sessionId ? `${cal.endpoint}${sep}session=${encodeURIComponent(cal.sessionId)}` : cal.endpoint;
      const r = await fetch(url, { cache: 'no-store' });
      const d = await r.json();
      if (d.error) { setFailed(true); return; }
      if (typeof d.answered === 'number') setAnswered(d.answered);
      if (d.complete) setServerComplete(true);
      const fresh: QuizItem[] = (d.items ?? []).filter((it: QuizItem) => !seen.current.has(`${it.mediaType}-${it.id}`));
      fresh.forEach((it) => seen.current.add(`${it.mediaType}-${it.id}`));
      if (fresh.length > 0) setQueue((q) => [...q, ...fresh]);
    } catch {
      setFailed(true);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [items, cal.endpoint, cal.sessionId]);

  useEffect(() => { void fetchBatch(); }, [fetchBatch]);
  useEffect(() => { shownAt.current = Date.now(); setMode('primary'); }, [idx]);
  useEffect(() => {
    if (isHarness) return;
    try { if (localStorage.getItem('wv_quiz_intro') !== '1') setShowIntro(true); } catch { /* ignore */ }
  }, [isHarness]);

  const current = queue[idx] ?? null;
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const send = useCallback(
    async (payload: PrimaryPayload) => {
      const c = queue[idx];
      if (!c || busy.current || complete) return;
      busy.current = true;
      setErrored(false);
      const eventId = uid();
      const full: SubmitPayload = {
        eventId,
        tmdbId: c.id,
        mediaType: c.mediaType,
        title: c.title,
        year: c.year,
        posterPath: c.posterPath,
        dwellMs: Date.now() - shownAt.current,
        source: cal.source,
        sessionId: cal.sessionId,
        ...payload,
      };
      try {
        const res = await submit(full);
        if (!res.ok) { setErrored(true); busy.current = false; return; }
        history.current.push({ eventId, idx });
        setAnswered((n) => n + 1);
        // DNA Confidence grows from this REAL calibration/pack answer — not from a
        // question merely appearing. Onboarding answers add calibration signal;
        // pack answers add pack signal.
        setTally((t) => ({
          ...t,
          calibrationAnswers: cal.source === 'calibration' ? t.calibrationAnswers + 1 : t.calibrationAnswers,
          packAnswers: cal.source.startsWith('pack:') ? t.packAnswers + 1 : t.packAnswers,
        }));
        advance();
      } catch {
        setErrored(true);
      } finally {
        busy.current = false;
      }
    },
    [queue, idx, submit, advance, cal.source, cal.sessionId, complete],
  );

  const onLooksGood = useCallback(() => void send({ recognition: 'unseen', attraction: 'interested' }), [send]);
  const onSkip = useCallback(() => void send({ recognition: 'unseen', attraction: 'not_interested' }), [send]);
  const onRate = useCallback((r: QuizRating) => void send({ recognition: 'seen', rating: r }), [send]);

  const undoLast = useCallback(async () => {
    const last = history.current.pop();
    if (!last) return;
    setAnswered((n) => Math.max(0, n - 1));
    setTally((t) => ({
      ...t,
      calibrationAnswers: cal.source === 'calibration' ? Math.max(0, t.calibrationAnswers - 1) : t.calibrationAnswers,
      packAnswers: cal.source.startsWith('pack:') ? Math.max(0, t.packAnswers - 1) : t.packAnswers,
    }));
    setServerComplete(false);
    setErrored(false);
    setIdx(last.idx);
    await undo(last.eventId).catch(() => {});
  }, [undo, cal.source]);

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

  // Finished onboarding (or ran the pool dry / chose "Finish Later").
  if (complete || finishedLater || !current) {
    const done = complete;
    return (
      <div className="wv-quiz-fit mx-auto flex max-w-md flex-col items-center justify-center text-center" data-testid="quiz-done">
        <div className="text-3xl" aria-hidden>🎬</div>
        {done ? (
          <>
            <p className="mt-2 text-2xl font-black text-white">
              {cal.showQuizProgress ? 'Calibration complete' : 'Pack complete'}
            </p>
            {cal.showQuizProgress && (
              <div className="mt-3 flex items-center gap-6" data-testid="done-metrics">
                <Metric label="Quiz Progress" value="100%" tone="brand" testid="done-quiz-progress" />
                <Metric label="Watch DNA Confidence" value={`${confidence}%`} tone="emerald" testid="done-dna-confidence" />
              </div>
            )}
            {!cal.showQuizProgress && (
              <p className="mt-2 text-sm text-slate-300">Watch DNA Confidence · <span className="font-bold text-emerald-300">{confidence}%</span></p>
            )}
          </>
        ) : (
          <p className="mt-2 text-2xl font-black text-white">That’s a wrap for now</p>
        )}
        <Link href={cal.doneHref ?? '/app/watch'} className="btn-primary mt-5 inline-flex" data-testid="quiz-done-cta">
          See my recommendations
        </Link>
      </div>
    );
  }

  return (
    <>
      {current.posterUrl && <div className="wv-cine-bg" style={{ backgroundImage: `url(${current.posterUrl})` }} aria-hidden />}
      <div className="wv-cine-scrim" aria-hidden />
      <div className="wv-cine-grain" aria-hidden />

      <div ref={rootRef} className="wv-quiz-fit relative z-10 mx-auto flex w-full max-w-md flex-col gap-2.5" data-testid="dna-quiz">
        {/* 1 · TWO metrics — Quiz Progress (onboarding) + Watch DNA Confidence */}
        <div className="shrink-0" data-testid="quiz-stage">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-200">🧬 {cal.label ?? 'Watch DNA'}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowIntro(true)} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-400 hover:text-slate-200" aria-label="How this works">ⓘ</button>
              <button onClick={() => void undoLast()} disabled={history.current.length === 0} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-2 text-xs font-bold text-brand-200 disabled:opacity-30" aria-label="Undo last answer">↶ Undo</button>
            </div>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-2">
            {cal.showQuizProgress ? (
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5" data-testid="quiz-progress">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quiz Progress</span>
                  <span className="text-[10px] font-semibold text-slate-300" data-testid="quiz-title-index">{progress.index} of {cal.total}</span>
                </div>
                <div className="mt-0.5 flex items-end gap-1.5">
                  <span key={`p${answered}`} className="wv-quiz-metric-pct wv-pop text-brand-200" data-testid="quiz-progress-pct">{progress.percent}%</span>
                </div>
                <div className="wv-dna-bar wv-dna-bar--brand mt-1"><span style={{ width: `${progress.percent}%` }} /></div>
                <div className="mt-0.5 text-[10px] text-slate-400" data-testid="quiz-eta">{fmtEta(progress.secondsRemaining)}</div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pack</span>
                <div className="mt-0.5 text-sm font-bold text-white" data-testid="pack-index">{progress.index} of {cal.total}</div>
              </div>
            )}

            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-2.5 py-1.5" data-testid="dna-confidence-card">
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">Watch DNA Confidence</span>
              <div className="mt-0.5 flex items-end gap-1.5">
                <span key={`c${confidence}`} className="wv-quiz-metric-pct wv-pop text-emerald-300" data-testid="dna-confidence">{confidence}%</span>
              </div>
              <div className="wv-dna-bar mt-1"><span style={{ width: `${confidence}%` }} /></div>
            </div>
          </div>
        </div>

        {/* 2 + 3 · Hero poster + title */}
        <div key={idx} className="wv-title-in flex min-h-0 flex-1 flex-col gap-2">
          <div className="wv-quiz-poster relative min-h-0 flex-1" data-testid="quiz-poster">
            {current.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.posterUrl} alt={current.title} className="wv-poster-hero" />
            ) : (
              <div className="wv-poster-fallback">
                <span className="text-lg font-black text-white">{current.title}</span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <div data-testid="quiz-title" className="wv-quiz-title line-clamp-2 text-center text-lg font-black leading-tight text-white drop-shadow">{current.title}</div>
            <div className="wv-quiz-meta mt-0.5 text-center text-xs font-medium text-slate-300">
              {[current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        {/* 4 · Three equal actions, or the "Seen it" rating step */}
        {mode === 'primary' ? (
          <div className="wv-quiz-grid shrink-0" data-testid="quiz-grid" role="group" aria-label="What do you think of this title?">
            <button onClick={onLooksGood} className={`wv-quiz-btn ${PRIMARY.looksGood.cls}`} data-testid={PRIMARY.looksGood.testid}>
              <span aria-hidden className="wv-quiz-ico">{PRIMARY.looksGood.icon}</span>{PRIMARY.looksGood.label}
            </button>
            <button onClick={onSkip} className={`wv-quiz-btn ${PRIMARY.skip.cls}`} data-testid={PRIMARY.skip.testid}>
              <span aria-hidden className="wv-quiz-ico">{PRIMARY.skip.icon}</span>{PRIMARY.skip.label}
            </button>
            <button onClick={() => setMode('rating')} className={`wv-quiz-btn ${PRIMARY.seen.cls}`} data-testid={PRIMARY.seen.testid}>
              <span aria-hidden className="wv-quiz-ico">{PRIMARY.seen.icon}</span>{PRIMARY.seen.label}
            </button>
          </div>
        ) : (
          <div className="shrink-0" data-testid="rating-step">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">How was it?</span>
              <button onClick={() => setMode('primary')} className="text-xs font-semibold text-slate-300" data-testid="rate-back">← Back</button>
            </div>
            <div className="wv-quiz-grid" role="group" aria-label="Rate this title">
              {RATINGS.map((r) => (
                <button key={r.key} onClick={() => onRate(r.key)} className={`wv-quiz-btn ${r.cls}`} data-testid={r.testid}>
                  <span aria-hidden className="wv-quiz-emoji">{r.emoji}</span>{r.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {errored && <p className="shrink-0 text-center text-xs text-red-300" data-testid="quiz-error">Couldn’t save — tap again.</p>}

        {/* Checkpoint at 10 — starter DNA ready */}
        {atCheckpoint && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" data-testid="quiz-checkpoint">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-card text-center">
              <div className="text-3xl" aria-hidden>✨</div>
              <h2 className="mt-1 text-2xl font-black text-white">Your starter Watch DNA is ready.</h2>
              <p className="mt-2 text-sm text-slate-300">
                {answered} of {cal.total} rated · Watch DNA Confidence{' '}
                <span className="font-bold text-emerald-300" data-testid="checkpoint-confidence">{confidence}%</span>. Keep going to sharpen it, or stop here.
              </p>
              <div className="mt-5 grid gap-2">
                <button onClick={() => setCheckpointDismissed(true)} className="btn-primary w-full py-3" data-testid="checkpoint-continue">Continue</button>
                <Link href={cal.doneHref ?? '/app/watch'} className="btn-secondary w-full py-3" data-testid="checkpoint-early-recs">See Early Recommendations</Link>
                <button onClick={() => setFinishedLater(true)} className="w-full py-2 text-sm font-semibold text-slate-300" data-testid="checkpoint-finish-later">Finish Later</button>
              </div>
            </div>
          </div>
        )}

        {/* One-time "how it works" sheet */}
        {showIntro && !atCheckpoint && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" data-testid="quiz-intro">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-card">
              <h2 className="text-center text-2xl font-black text-white">🧬 Build your Watch DNA</h2>
              <p className="mt-2 text-center text-base text-slate-300">
                {cal.showQuizProgress ? `${cal.total} quick titles — one tap each. ` : ''}Two things move: <span className="font-semibold text-brand-200">Quiz Progress</span> (how far along) and <span className="font-semibold text-emerald-300">DNA Confidence</span> (how well we know you).
              </p>
              <ul className="mt-5 space-y-3">
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--liked"><span className="wv-quiz-ico">{ICONS.star}</span> Looks Good</span><span className="text-base text-slate-200">Caught your eye</span></li>
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--nope"><span className="wv-quiz-ico">{ICONS.skip}</span> Skip</span><span className="text-base text-slate-200">Not for you</span></li>
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--seen"><span className="wv-quiz-ico">{ICONS.eye}</span> Seen It</span><span className="text-base text-slate-200">Already watched — give it a quick rating</span></li>
              </ul>
              <button onClick={dismissIntro} className="btn-primary mt-6 w-full py-3.5 text-lg" data-testid="quiz-intro-dismiss">Got it — let’s go</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, tone, testid }: { label: string; value: string; tone: 'brand' | 'emerald'; testid?: string }) {
  const color = tone === 'brand' ? 'text-brand-200' : 'text-emerald-300';
  return (
    <div className="text-center" data-testid={testid}>
      <div className={`text-3xl font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
