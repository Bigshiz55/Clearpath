'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { recordQuizAnswer, undoQuizAnswer } from '@/lib/actions/dnaQuiz';
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
  attraction?: AttractionGrade;
  watchlist?: boolean;
  dnf?: boolean;
  reasons?: string[];
  dwellMs?: number;
}

interface Props {
  totalRated?: number;
  items?: QuizItem[];
  onSubmit?: (p: SubmitPayload) => Promise<{ ok: boolean; error?: string }>;
  onUndo?: (eventId: string) => Promise<{ ok: boolean }>;
}

type PrimaryPayload = Pick<SubmitPayload, 'recognition' | 'attraction' | 'rating' | 'watchlist'>;

/**
 * Four primary actions — one tap, then the next title. Intent stays distinct:
 *   ⭐ Looks Good → attraction 'interested'   (mild interest, NOT saved)
 *   📌 Save       → attraction 'must_watch' + saved to the high-intent watchlist
 *   ⏭ Skip       → attraction 'not_interested' (a real "not for me" signal)
 *   👁 Seen It    → opens the 4-way rating step → Experience DNA
 */
/** Crisp line/solid icons — premium and consistent (emoji rendered inconsistently
 *  across devices). Sized 1.15rem, currentColor. */
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

const PRIMARY = {
  looksGood: { label: 'Looks Good', icon: ICONS.star, cls: 'wv-quiz-btn--liked', testid: 'act-looks-good' },
  save: { label: 'Save', icon: ICONS.bookmark, cls: 'wv-quiz-btn--gold', testid: 'act-save' },
  skip: { label: 'Skip', icon: ICONS.skip, cls: 'wv-quiz-btn--nope', testid: 'act-skip' },
  seen: { label: 'Seen It', icon: ICONS.eye, cls: 'wv-quiz-btn--seen', testid: 'act-seen' },
} as const;

const RATINGS: { key: QuizRating; label: string; emoji: string; cls: string; testid: string }[] = [
  { key: 'loved', label: 'Loved It', emoji: '❤️', cls: 'wv-quiz-btn--loved', testid: 'rate-loved' },
  { key: 'liked', label: 'Liked It', emoji: '👍', cls: 'wv-quiz-btn--liked', testid: 'rate-liked' },
  { key: 'okay', label: 'It Was Okay', emoji: '😐', cls: 'wv-quiz-btn--unseen', testid: 'rate-okay' },
  { key: 'disliked', label: 'Didn’t Like It', emoji: '👎', cls: 'wv-quiz-btn--disliked', testid: 'rate-disliked' },
];

/** Common genres so "Still learning" always has something honest to show. */
const COMMON_GENRES = ['Action', 'Comedy', 'Crime', 'Drama', 'Sci-Fi', 'Thriller', 'Romance', 'Horror', 'Mystery', 'Animation', 'Documentary', 'Fantasy'];

type GenreStat = Record<string, { pos: number; neg: number }>;

/** Session-local learning view — an honest progress meter, not a fabricated rating. */
function dnaView(genres: GenreStat, answered: number) {
  const confidence = Math.min(96, Math.round(100 * (1 - Math.exp(-answered / 22))));
  const net = (g: string) => (genres[g]?.pos ?? 0) - (genres[g]?.neg ?? 0);
  const encountered = Object.keys(genres);
  const expert = encountered.filter((g) => net(g) >= 2).sort((a, b) => net(b) - net(a)).slice(0, 3);
  const learnFrom = [
    ...encountered.filter((g) => !expert.includes(g)),
    ...COMMON_GENRES.filter((g) => !(g in genres)),
  ];
  const learning = Array.from(new Set(learnFrom)).filter((g) => !expert.includes(g)).slice(0, 3);
  return { confidence, expert, learning };
}

function titleCase(g: string) { return g.replace(/\b\w/g, (c) => c.toUpperCase()); }

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `q_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;

/**
 * Cinematic ONE-TILE discovery quiz. A blurred backdrop from the current poster
 * fills any aspect ratio (no black bars, phone → ultrawide); the crisp poster is
 * the hero. A live Watch-DNA meter animates as you rate. Every action is one tap
 * → the next title slides in — no popups, no lingering overlays, nothing between
 * cards. Fits the usable viewport with no scrolling at every size.
 */
export function DnaQuiz({ totalRated = 0, items, onSubmit, onUndo }: Props) {
  const submit = onSubmit ?? recordQuizAnswer;
  const undo = onUndo ?? undoQuizAnswer;
  const isHarness = !!items;

  const [queue, setQueue] = useState<QuizItem[]>(items ?? []);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<'primary' | 'rating'>('primary');
  const [answered, setAnswered] = useState(totalRated);
  const [genres, setGenres] = useState<GenreStat>({});
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(!items);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const [showIntro, setShowIntro] = useState(false);

  const shownAt = useRef<number>(Date.now());
  const busy = useRef(false);
  const history = useRef<{ eventId: string; idx: number; genre?: string; pos: boolean; neg: boolean }[]>([]);
  const seen = useRef<Set<string>>(new Set((items ?? []).map((i) => `${i.mediaType}-${i.id}`)));
  const fetching = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const view = useMemo(() => dnaView(genres, answered), [genres, answered]);

  // Measured, device-agnostic fit — correct the tile height by exactly the
  // document overflow/slack via visualViewport. Only the poster shrinks.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const fit = () => {
      // True desktop (wide AND tall) sizes via CSS; no bottom nav to clear.
      if (window.innerWidth >= 640 && window.innerHeight >= 640) { el.style.height = ''; el.style.minHeight = ''; return; }
      // Deterministic fill: from the tile's top down to the reserved bottom
      // (the real page paddings that sit below it), measured live so iOS Safari
      // chrome + safe areas are always accounted for. No dvh/scrollHeight math
      // (that mis-fires on iOS and shrank the poster to a thumbnail).
      el.style.minHeight = '0';
      el.style.height = '';
      const vpH = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const main = el.closest('main');
      const outer = main?.parentElement ?? null;
      const pb = (n: Element | null) => (n ? parseFloat(getComputedStyle(n).paddingBottom) || 0 : 0);
      const reserveBelow = pb(main) + pb(outer); // main py-6 bottom + outer nav reserve
      el.style.height = `${Math.max(180, Math.round(vpH - top - reserveBelow))}px`;
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
  useEffect(() => { shownAt.current = Date.now(); setMode('primary'); }, [idx]);
  useEffect(() => {
    if (isHarness) return;
    try { if (localStorage.getItem('wv_quiz_intro') !== '1') setShowIntro(true); } catch { /* ignore */ }
  }, [isHarness]);

  const current = queue[idx] ?? null;
  const advance = useCallback(() => setIdx((i) => i + 1), []);

  const bumpGenre = (genre: string | undefined, pos: boolean, neg: boolean) => {
    if (!genre) return;
    const g = titleCase(genre);
    setGenres((prev) => {
      const cur = prev[g] ?? { pos: 0, neg: 0 };
      return { ...prev, [g]: { pos: cur.pos + (pos ? 1 : 0), neg: cur.neg + (neg ? 1 : 0) } };
    });
  };

  // ONE write, then advance. No popups, no pause.
  const send = useCallback(
    async (payload: PrimaryPayload) => {
      const c = queue[idx];
      if (!c || busy.current) return;
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
        ...payload,
      };
      const pos = payload.recognition === 'seen' ? payload.rating === 'loved' || payload.rating === 'liked' : payload.attraction === 'interested' || payload.attraction === 'must_watch';
      const neg = payload.recognition === 'seen' ? payload.rating === 'disliked' || payload.rating === 'hated' : payload.attraction === 'not_interested' || payload.attraction === 'absolutely_not';
      try {
        const res = await submit(full);
        if (!res.ok) { setErrored(true); busy.current = false; return; }
        history.current.push({ eventId, idx, genre: c.genre ?? undefined, pos, neg });
        setAnswered((n) => n + 1);
        bumpGenre(c.genre ?? undefined, pos, neg);
        advance();
      } catch {
        setErrored(true);
      } finally {
        busy.current = false;
      }
    },
    [queue, idx, submit, advance],
  );

  const onLooksGood = useCallback(() => void send({ recognition: 'unseen', attraction: 'interested' }), [send]);
  const onSave = useCallback(() => void send({ recognition: 'unseen', attraction: 'must_watch', watchlist: true }), [send]);
  const onSkip = useCallback(() => void send({ recognition: 'unseen', attraction: 'not_interested' }), [send]);
  const onRate = useCallback((r: QuizRating) => void send({ recognition: 'seen', rating: r }), [send]);

  const undoLast = useCallback(async () => {
    const last = history.current.pop();
    if (!last) return;
    setAnswered((n) => Math.max(0, n - 1));
    if (last.genre) {
      const g = titleCase(last.genre);
      setGenres((prev) => {
        const cur = prev[g]; if (!cur) return prev;
        return { ...prev, [g]: { pos: Math.max(0, cur.pos - (last.pos ? 1 : 0)), neg: Math.max(0, cur.neg - (last.neg ? 1 : 0)) } };
      });
    }
    setErrored(false);
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
        <p className="text-2xl font-black text-white">That’s a wrap for now 🎬</p>
        <p className="mt-2 text-sm text-slate-300">Watch DNA · {view.confidence}% prediction confidence</p>
        <Link href="/app/watch" className="btn-primary mt-5 inline-flex">See my picks</Link>
      </div>
    );
  }

  return (
    <>
      {/* Cinematic backdrop generated from the current poster */}
      {current.posterUrl && <div className="wv-cine-bg" style={{ backgroundImage: `url(${current.posterUrl})` }} aria-hidden />}
      <div className="wv-cine-scrim" aria-hidden />
      <div className="wv-cine-grain" aria-hidden />

      <div ref={rootRef} className="wv-quiz-fit relative z-10 mx-auto flex w-full max-w-md flex-col gap-2.5" data-testid="dna-quiz">
        {/* 1 · Watch-DNA progress */}
        <div className="shrink-0" data-testid="quiz-stage">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-200">🧬 Watch DNA</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowIntro(true)} className="rounded-md px-1.5 py-1 text-slate-400 hover:text-slate-200" aria-label="How this works">ⓘ</button>
              <button onClick={() => void undoLast()} disabled={history.current.length === 0} className="rounded-md px-2 py-1 text-xs font-bold text-brand-200 disabled:opacity-30" aria-label="Undo last answer">↶ Undo</button>
            </div>
          </div>
          <div className="mt-0.5 flex items-end gap-2">
            <span key={answered} className="wv-dna-pct wv-pop" data-testid="dna-confidence">{view.confidence}%</span>
            <span className="pb-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-400">Prediction<br />confidence</span>
          </div>
          <div className="wv-dna-bar mt-1.5"><span style={{ width: `${view.confidence}%` }} /></div>
          <div className="wv-dna-detail mt-2 gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-emerald-300">Expert in</span>
              {view.expert.length ? view.expert.map((g) => <span key={g} className="wv-dna-chip wv-dna-chip--expert">{g}</span>)
                : <span className="text-[11px] text-slate-400">building your profile…</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-300">Still learning</span>
              {view.learning.map((g) => <span key={g} className="wv-dna-chip wv-dna-chip--learning">{g}</span>)}
            </div>
          </div>
        </div>

        {/* 2 + 3 · Hero poster + title (slides in on every new title) */}
        <div key={idx} className="wv-title-in flex min-h-0 flex-1 flex-col gap-2">
          <div className="relative min-h-0 flex-1" data-testid="quiz-poster">
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
            <div data-testid="quiz-title" className="line-clamp-2 text-center text-lg font-black leading-tight text-white drop-shadow">{current.title}</div>
            <div className="mt-0.5 text-center text-xs font-medium text-slate-300">
              {[current.year, current.mediaType === 'tv' ? 'TV' : 'Movie', current.genre].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>

        {/* 4 · Four equal buttons — actions, or the "Seen it" rating step */}
        {mode === 'primary' ? (
          <div className="wv-quiz-grid shrink-0" data-testid="quiz-grid" role="group" aria-label="What do you think of this title?">
            <button onClick={onLooksGood} className={`wv-quiz-btn ${PRIMARY.looksGood.cls}`} data-testid={PRIMARY.looksGood.testid}>
              <span aria-hidden className="wv-quiz-ico">{PRIMARY.looksGood.icon}</span>{PRIMARY.looksGood.label}
            </button>
            <button onClick={onSave} className={`wv-quiz-btn ${PRIMARY.save.cls}`} data-testid={PRIMARY.save.testid}>
              <span aria-hidden className="wv-quiz-ico">{PRIMARY.save.icon}</span>{PRIMARY.save.label}
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

        {/* One-time "how it works" sheet */}
        {showIntro && (
          <div className="fixed inset-0 z-[120] flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" data-testid="quiz-intro">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-card">
              <h2 className="text-center text-2xl font-black text-white">🧬 Build your Watch DNA</h2>
              <p className="mt-2 text-center text-base text-slate-300">We’ll show you titles one at a time. For each, tap one — that’s it.</p>
              <ul className="mt-5 space-y-3">
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--liked"><span className="wv-quiz-ico">{ICONS.star}</span> Looks Good</span><span className="text-base text-slate-200">Caught your eye <span className="text-slate-400">(won’t save it)</span></span></li>
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--gold"><span className="wv-quiz-ico">{ICONS.bookmark}</span> Save</span><span className="text-base text-slate-200">You want to watch it</span></li>
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--nope"><span className="wv-quiz-ico">{ICONS.skip}</span> Skip</span><span className="text-base text-slate-200">Not for you</span></li>
                <li className="flex items-center gap-3"><span className="wv-quiz-legend wv-quiz-btn--seen"><span className="wv-quiz-ico">{ICONS.eye}</span> Seen It</span><span className="text-base text-slate-200">Already watched — rate it</span></li>
              </ul>
              <button onClick={dismissIntro} className="btn-primary mt-6 w-full py-3.5 text-lg" data-testid="quiz-intro-dismiss">Got it — let’s go</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
