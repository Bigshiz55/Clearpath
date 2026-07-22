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

const GOAL = 50;
type Choice = 'yes' | 'no' | 'maybe' | 'skip';
const RATING: Record<Exclude<Choice, 'skip'>, number> = { yes: 9, maybe: 6, no: 2 };

/**
 * Rapid taste game — one tile up top, four quick calls (Yes / No / Maybe / Haven't
 * seen) and it flies to the next. Each rating feeds your DNA. A round is 50; hit
 * 50 and it recalculates your algorithm. Endless — the more you play, the sharper
 * your recommendations get. `totalRated` seeds the lifetime counter.
 */
export function LikeHateGame({ totalRated = 0 }: { totalRated?: number }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [total, setTotal] = useState(totalRated); // lifetime, persists
  const [round, setRound] = useState(0); // 0..GOAL for the current round
  const [phase, setPhase] = useState<'play' | 'calc' | 'done'>('play');
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
      if (d.error) {
        setFailed(true);
        return;
      }
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

  useEffect(() => {
    if (queue.length - idx <= 5 && !failed) void fetchBatch();
  }, [idx, queue.length, failed, fetchBatch]);

  const current = queue[idx] ?? null;

  const decide = useCallback(
    (kind: Choice) => {
      if (phase !== 'play') return;
      const c = queue[idx];
      if (!c) return;
      if (kind !== 'skip') {
        setTotal((t) => t + 1);
        setRound((r) => {
          const n = r + 1;
          if (n >= GOAL) setPhase('calc');
          return n;
        });
        void rateQuizTitle({
          tmdbId: c.id,
          mediaType: c.mediaType,
          title: c.title,
          year: c.year,
          posterPath: c.posterPath,
          rating: RATING[kind],
        }).catch(() => {});
      }
      setIdx((i) => i + 1);
    },
    [phase, queue, idx],
  );

  // Calculate → done, with a brief "crunching" beat.
  useEffect(() => {
    if (phase !== 'calc') return;
    const t = setTimeout(() => setPhase('done'), 1400);
    return () => clearTimeout(t);
  }, [phase]);

  // Keyboard: → Yes · ← No · ↑ Maybe · ↓ Haven't seen.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== 'play') return;
      const map: Record<string, Choice> = { ArrowRight: 'yes', ArrowLeft: 'no', ArrowUp: 'maybe', ArrowDown: 'skip' };
      const k = map[e.key];
      if (k) { e.preventDefault(); decide(k); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, phase]);

  function nextRound() {
    setRound(0);
    setPhase('play');
  }

  // The one big promise, always on screen.
  const Banner = (
    <div className="mb-4 rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/20 to-fuchsia-500/15 px-4 py-3 text-center">
      <div className="text-base font-black text-white sm:text-lg">🔥 The more you play, the sharper it gets.</div>
      <div className="mt-0.5 text-xs text-brand-100">
        You’ve rated <span className="font-black tabular-nums text-white">{total}</span> title{total === 1 ? '' : 's'}
      </div>
    </div>
  );

  if (failed) {
    return <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">Couldn’t load titles. Make sure movie data is connected, then try again.</p>;
  }

  if (phase === 'calc') {
    return (
      <div className="mt-5">
        {Banner}
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <div className="text-lg font-bold text-white">🧬 Crunching your algorithm…</div>
          <p className="text-sm text-slate-400">Re-reading your {total} ratings.</p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="mt-5">
        {Banner}
        <div className="card p-8 text-center">
          <div className="text-4xl">🎯</div>
          <h2 className="mt-3 text-xl font-bold text-white">Your taste just leveled up!</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
            <span className="font-bold text-white">{total}</span> ratings in the bank. Every round makes your recommendations more accurate — keep going, or go see them now.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button onClick={nextRound} className="btn-primary">⚡ Rate 50 more</button>
            <Link href="/app" className="btn-secondary">See my recommendations →</Link>
          </div>
        </div>
      </div>
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
        <h2 className="mt-3 text-xl font-bold text-white">You’ve rated {total} titles!</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">Nothing left to rate right now — fresh titles rotate in over time.</p>
        <Link href="/app" className="btn-primary mt-6 inline-flex">See my recommendations →</Link>
      </div>
    );
  }

  const pct = (round / GOAL) * 100;

  return (
    <div className="mt-5">
      {Banner}

      {/* Round progress toward 50 */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">This round: {round}/{GOAL}</span>
        <span className="text-slate-500">{GOAL - round} to recalc</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {/* The tile */}
      <div key={idx} className="animate-fade-up flex flex-col items-center text-center">
        <div className="h-56 w-40 overflow-hidden rounded-2xl border border-white/10 shadow-card sm:h-64 sm:w-44">
          <Poster posterUrl={current.posterUrl} title={current.title} />
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">{current.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
          <h2 className="text-base font-bold text-white sm:text-lg">
            {current.title}
            {current.year ? <span className="font-normal text-slate-400"> ({current.year})</span> : null}
          </h2>
        </div>
      </div>

      {/* Four calls in a row */}
      <div className="mt-5 grid grid-cols-4 gap-2">
        {([
          { k: 'yes', emoji: '👍', label: 'Yes', cls: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25' },
          { k: 'no', emoji: '👎', label: 'No', cls: 'border-red-400/50 bg-red-500/15 text-red-100 hover:bg-red-500/25' },
          { k: 'maybe', emoji: '🤔', label: 'Maybe', cls: 'border-amber-400/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25' },
          { k: 'skip', emoji: '🤷', label: 'Haven’t seen', cls: 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10' },
        ] as const).map((b) => (
          <button
            key={b.k}
            onClick={() => decide(b.k)}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 py-3.5 font-black leading-tight transition active:scale-95 ${b.cls}`}
          >
            <span className="text-2xl leading-none">{b.emoji}</span>
            <span className="text-center text-[11px]">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">Tap or use → Yes · ← No · ↑ Maybe · ↓ Haven’t seen</p>
    </div>
  );
}
