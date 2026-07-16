'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

// Court-themed rulings → a 1–10 rating the taste engine already understands.
const RULINGS: { label: string; emoji: string; rating: number; style: string }[] = [
  { label: 'Loved it', emoji: '⚖️', rating: 9, style: 'border-gold-400/60 bg-gold-500/20 text-amber-100 hover:bg-gold-500/30' },
  { label: 'Pretty good', emoji: '👍', rating: 7, style: 'border-brand-400/50 bg-brand-500/15 text-brand-100 hover:bg-brand-500/25' },
  { label: 'It was okay', emoji: '😐', rating: 5, style: 'border-white/20 bg-white/5 text-slate-200 hover:bg-white/10' },
  { label: 'Not for me', emoji: '👎', rating: 2, style: 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25' },
];

/** "The Docket" — a court-themed taste game. Rule on as many cases as you like;
 *  each ruling tunes your taste. Adjourn (stop) whenever you want. */
export function TasteGame({ onDone }: { onDone: (ruledCount: number) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [ruled, setRuled] = useState(0);
  const [failed, setFailed] = useState(false);
  const fetching = useRef(false);

  const loadMore = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch('/api/quiz');
      const data = await res.json();
      if (data.error) {
        if (items.length === 0) setFailed(true);
        return;
      }
      const incoming: Item[] = data.items ?? [];
      setItems((prev) => {
        const have = new Set(prev.map((p) => `${p.mediaType}-${p.id}`));
        return [...prev, ...incoming.filter((i) => !have.has(`${i.mediaType}-${i.id}`))];
      });
    } catch {
      if (items.length === 0) setFailed(true);
    } finally {
      fetching.current = false;
    }
  }, [items.length]);

  useEffect(() => {
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Top up the deck before it runs dry so the game feels endless.
  useEffect(() => {
    if (items.length > 0 && idx >= items.length - 3) void loadMore();
  }, [idx, items.length, loadMore]);

  const current = items[idx] ?? null;

  function advance() {
    setIdx((i) => i + 1);
  }
  function rule(rating: number) {
    if (!current) return;
    setRuled((n) => n + 1);
    void rateQuizTitle({
      tmdbId: current.id,
      mediaType: current.mediaType,
      title: current.title,
      year: current.year,
      posterPath: current.posterPath,
      rating,
    }).catch(() => {});
    advance();
  }

  return (
    <div className="mx-auto max-w-2xl px-1 pb-16 pt-4">
      <div className="text-center">
        <h1 className="text-3xl font-black text-white sm:text-4xl">⚖️ The Docket</h1>
        <p className="mt-2 text-lg text-slate-300">Rule on each case to teach the court your taste. Stop whenever you like.</p>
      </div>

      {failed ? (
        <div className="mt-8 rounded-2xl border-2 border-white/15 bg-white/5 p-6 text-center">
          <p className="text-xl text-slate-200">The docket couldn’t be loaded right now.</p>
          <button onClick={() => onDone(ruled)} className="btn-primary mt-4 px-6 py-3 text-lg">Back to my picks</button>
        </div>
      ) : !current ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-slate-300">
          <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <span className="text-lg">Calling the next case…</span>
        </div>
      ) : (
        <>
          <div className="mt-3 text-center text-base font-semibold text-slate-400">Case #{ruled + 1} · {ruled} ruled so far</div>

          <div className="mt-4 flex flex-col items-center text-center">
            <div className="h-64 w-44 overflow-hidden rounded-2xl border-2 border-white/10 shadow-card">
              <Poster posterUrl={current.posterUrl} title={current.title} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase text-slate-300">{current.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
              <h2 className="text-xl font-black text-white">
                {current.title}{current.year ? <span className="font-semibold text-slate-400"> ({current.year})</span> : null}
              </h2>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-center text-lg font-semibold text-slate-200">Your ruling?</div>
            <div className="grid grid-cols-2 gap-3">
              {RULINGS.map((r) => (
                <button key={r.label} onClick={() => rule(r.rating)} className={`flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 text-xl font-bold transition ${r.style}`}>
                  <span className="text-2xl" aria-hidden>{r.emoji}</span> {r.label}
                </button>
              ))}
            </div>
            <button onClick={advance} className="mt-3 w-full rounded-2xl border-2 border-white/15 bg-white/5 py-4 text-lg font-bold text-slate-300 hover:bg-white/10">
              🤷 Never seen it — next case →
            </button>
          </div>

          <div className="mt-6 text-center">
            <button onClick={() => onDone(ruled)} className="rounded-xl border-2 border-gold-400/50 bg-gold-500/10 px-6 py-3 text-lg font-bold text-amber-100 hover:bg-gold-500/20">
              ⚖️ Adjourn court{ruled > 0 ? ` (${ruled} ruled)` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
