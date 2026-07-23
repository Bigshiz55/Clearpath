'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Poster } from './PosterCard';
import { DnaMirror } from './DnaMirror';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { useI18n } from '@/i18n/I18nProvider';

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

const SECONDS = 7;

function ratingColor(n: number): string {
  if (n <= 3) return 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25';
  if (n <= 6) return 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10';
  if (n <= 8) return 'border-brand-400/40 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25';
  return 'border-gold-400/50 bg-gold-500/20 text-amber-100 hover:bg-gold-500/30';
}

export function QuizGame() {
  const { t, plural } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rated, setRated] = useState(0);
  const [seen, setSeen] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceRef = useRef<() => void>(() => {});

  function load() {
    setItems(null);
    setIdx(0);
    setRated(0);
    setSeen(0);
    setFailed(false);
    fetch('/api/quiz', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => (d.error ? setFailed(true) : setItems(d.items ?? [])))
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    load();
  }, []);

  const current = items && idx < items.length ? items[idx] : null;
  const done = items != null && idx >= items.length;

  advanceRef.current = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIdx((i) => i + 1);
  };

  // Per-title countdown; auto-skip at 0.
  useEffect(() => {
    if (!current) return;
    setTimeLeft(SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          advanceRef.current();
          return SECONDS;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [idx, current]);

  function rate(score: number) {
    if (!current) return;
    setRated((n) => n + 1);
    setSeen((n) => n + 1);
    // Fire-and-forget so the game stays snappy.
    void rateQuizTitle({
      tmdbId: current.id,
      mediaType: current.mediaType,
      title: current.title,
      year: current.year,
      posterPath: current.posterPath,
      rating: score,
    }).catch(() => {});
    advanceRef.current();
  }

  function skip() {
    advanceRef.current();
  }

  if (failed) {
    return (
      <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {t('ask.quizLoadError')}
      </p>
    );
  }

  if (!items) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 text-slate-400">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <span className="text-sm">{t('ask.loadingTitles')}</span>
      </div>
    );
  }

  if (items && items.length === 0) {
    return (
      <div className="mt-8 card p-8 text-center">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-3 text-xl font-bold text-white">{t('ask.ratedEverything')}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          {t('ask.wellFed')}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => load()} className="btn-secondary">{t('ask.tryAgain')}</button>
          <Link href="/app" className="btn-primary">{t('ask.seeMyRecs')}</Link>
        </div>
      </div>
    );
  }

  if (done) {
    // The payoff: don't *claim* the DNA got smarter — *show* it. The Mirror
    // reflects their taste back and proves it with picks, then asks the one
    // trust question that matters.
    return (
      <div className="mt-6">
        <div className="text-center">
          <div className="text-4xl">🧬</div>
          <h2 className="mt-2 text-xl font-bold text-white">{plural('ask.youRatedRead', rated, { count: rated })}</h2>
        </div>
        <DnaMirror onReplay={() => { window.scrollTo({ top: 0 }); load(); }} />
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="mt-5">
      {/* Progress */}
      <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
        <span>
          {idx + 1} / {items.length}
        </span>
        <span>{t('ask.ratedCount', { count: rated })}</span>
      </div>
      {/* Countdown bar */}
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand-400 transition-[width] duration-1000 ease-linear"
          style={{ width: `${(timeLeft / SECONDS) * 100}%` }}
        />
      </div>

      {/* Poster + title (compact so the ratings + N/A stay on-screen) */}
      <div className="flex flex-col items-center text-center">
        <div className="h-44 w-[7.5rem] overflow-hidden rounded-2xl border border-white/10 shadow-card sm:h-56 sm:w-40">
          <Poster posterUrl={current.posterUrl} title={current.title} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
            {current.mediaType === 'movie' ? t('ask.movie') : t('ask.tv')}
          </span>
          <h2 className="text-base font-bold text-white sm:text-lg">
            {current.title}
            {current.year ? <span className="font-normal text-slate-400"> ({current.year})</span> : null}
          </h2>
        </div>
      </div>

      {/* Rating buttons */}
      <div className="mt-4">
        <div className="mb-1 flex justify-between px-1 text-[11px] text-slate-500">
          <span>{t('ask.notForMe')}</span>
          <span>{t('ask.loveIt')}</span>
        </div>
        <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => rate(n)}
              className={`h-11 rounded-xl border text-base font-bold tabular-nums transition ${ratingColor(n)}`}
              aria-label={t('ask.rateNof10', { n })}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={skip}
          className="mt-3 w-full rounded-xl border border-gold-400/40 bg-gold-500/10 py-3 text-sm font-semibold text-amber-100 hover:bg-gold-500/20"
        >
          {t('ask.haventSeenSkip')}
        </button>
      </div>
    </div>
  );
}
