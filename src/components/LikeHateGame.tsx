'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Poster } from './PosterCard';
import { rateQuizTitle } from '@/lib/actions/quiz';

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
  posterUrl: string | null;
}

const GOAL = 100;

/**
 * Rapid taste game — one tile up top, tap − (Nope) or + (Like), and it flies to
 * the next. Like → rated 9, Nope → rated 2; both feed your DNA. Endless: it tops
 * up the queue so you can rip through 100 in a couple of minutes. Arrow keys work
 * too (← Nope · → Like · ↓ skip).
 */
export function LikeHateGame() {
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [rated, setRated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dry, setDry] = useState(false);
  const seen = useRef<Set<string>>(new Set());
  const fetching = useRef(false);

  const fetchBatch = useCallback(async () => {
    if (fetching.current || dry) return;
    fetching.current = true;
    try {
      const r = await fetch('/api/quiz', { cache: 'no-store' });
      const d = await r.json();
      if (d.error) { setFailed(true); return; }
      const fresh: Item[] = (d.items ?? []).filter((it: Item) => !seen.current.has(`${it.mediaType}-${it.id}`));
      fresh.forEach((it) => seen.current.add(`${it.mediaType}-${it.id}`));
      if (fresh.length === 0) setDry(true);
      else setQueue((q) => [...q, ...fresh]);
    } catch {
      setFailed(true);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [dry]);

  useEffect(() => { void fetchBatch(); }, [fetchBatch]);

  // Top up before we run out so the flow never stalls.
  useEffect(() => {
    if (queue.length - idx <= 4 && !failed) void fetchBatch();
  }, [idx, queue.length, failed, fetchBatch]);

  const current = queue[idx] ?? null;

  const decide = useCallback(
    (kind: 'like' | 'nope' | 'skip') => {
      const c = queue[idx];
      if (!c) return;
      if (kind !== 'skip') {
        setRated((n) => n + 1);
        void rateQuizTitle({
          tmdbId: c.id,
          mediaType: c.mediaType,
          title: c.title,
          year: c.year,
          posterPath: c.posterPath,
          rating: kind === 'like' ? 9 : 2,
        }).catch(() => {});
      }
      setIdx((i) => i + 1);
    },
    [queue, idx],
  );

  // Keyboard: ← Nope · → Like · ↓/space skip.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); decide('nope'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); decide('like'); }
      else if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); decide('skip'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide]);

  if (failed) {
    return (
      <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        Couldn’t load titles. Make sure movie data is connected, then try again.
      </p>
    );
  }

  if (!current) {
    if (loading) {
      return (
        <div className="mt-8 flex flex-col items-center gap-3 text-slate-400">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <span className="text-sm">Loading titles…</span>
        </div>
      );
    }
    return (
      <div className="mt-8 card p-8 text-center">
        <div className="text-4xl">🧬</div>
        <h2 className="mt-3 text-xl font-bold text-white">You rated {rated} titles!</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
          {rated > 0 ? 'Your DNA just got sharper.' : 'Nothing left to rate right now —'} fresh titles rotate in over time.
        </p>
        <Link href="/app" className="btn-primary mt-6 inline-flex">See my recommendations →</Link>
      </div>
    );
  }

  const pct = Math.min(100, (rated / GOAL) * 100);

  return (
    <div className="mt-5">
      {/* Progress toward 100 */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">{rated} rated</span>
        <span className="text-slate-500">Goal {GOAL}</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {/* The tile — up top */}
      <div key={idx} className="animate-fade-up flex flex-col items-center text-center">
        <div className="h-56 w-40 overflow-hidden rounded-2xl border border-white/10 shadow-card sm:h-64 sm:w-44">
          <Poster posterUrl={current.posterUrl} title={current.title} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
            {current.mediaType === 'movie' ? 'Movie' : 'TV'}
          </span>
          <h2 className="text-base font-bold text-white sm:text-lg">
            {current.title}
            {current.year ? <span className="font-normal text-slate-400"> ({current.year})</span> : null}
          </h2>
        </div>
      </div>

      {/* − / + */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => decide('nope')}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-red-400/50 bg-red-500/15 py-5 text-lg font-black text-red-100 transition active:scale-95 hover:bg-red-500/25"
        >
          <span className="text-2xl leading-none">−</span> Nope
        </button>
        <button
          onClick={() => decide('like')}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-400/50 bg-emerald-500/15 py-5 text-lg font-black text-emerald-100 transition active:scale-95 hover:bg-emerald-500/25"
        >
          <span className="text-2xl leading-none">+</span> Like
        </button>
      </div>
      <button
        onClick={() => decide('skip')}
        className="mt-3 w-full rounded-xl border border-white/12 bg-white/5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
      >
        🤷 Haven’t seen it — skip →
      </button>
      <p className="mt-2 text-center text-[11px] text-slate-500">Tap or use ← Nope · → Like · ↓ skip</p>
    </div>
  );
}
