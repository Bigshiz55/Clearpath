'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EMPTY_QUERY } from '@/lib/finderParse';

interface Item {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  matchScore: number;
  primaryCall: string;
}

const CALL_STYLE: Record<string, string> = {
  'WATCH IT': 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  MAYBE: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100',
  'SKIP IT': 'border-red-400/40 bg-red-500/15 text-red-100',
};

/**
 * "Quick ruling" — one tap and the judge instantly hands down a ranked list of
 * recommendations (the finder with no filters), shown right here. No typing,
 * no navigating away.
 */
export function QuickRuling() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState(false);

  async function rule() {
    setState('loading');
    setError(false);
    try {
      const res = await fetch('/api/finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: EMPTY_QUERY, watcher: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setItems((data.items ?? []) as Item[]);
      setState('done');
    } catch {
      setError(true);
      setState('done');
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gold-400/40 bg-gradient-to-br from-gold-500/15 to-brand-500/10 p-5">
      <button onClick={rule} disabled={state === 'loading'} className="flex w-full items-center gap-3 text-left disabled:opacity-70">
        <span className="text-3xl" aria-hidden>🎲</span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-black text-white">Quick ruling</div>
          <div className="text-sm leading-snug text-slate-300">
            {state === 'loading'
              ? 'The judge is ruling…'
              : state === 'done'
                ? 'Tap for a fresh set.'
                : 'Don’t feel like deciding? One tap for instant recommendations.'}
          </div>
        </div>
        <span className="flex-none rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white shadow-glow">
          {state === 'idle' ? 'Rule ⚖️' : state === 'loading' ? '…' : 'Again ↻'}
        </span>
      </button>

      {state === 'loading' && (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          Combing the catalog for you…
        </div>
      )}

      {state === 'done' && error && (
        <p className="mt-4 text-sm text-red-300">Couldn’t reach the court. Tap “Again” to retry.</p>
      )}

      {state === 'done' && !error && items.length > 0 && (
        <ol className="mt-4 space-y-2">
          {items.map((it, i) => (
            <li key={`${it.mediaType}-${it.id}`}>
              <Link
                href={`/app/title/${it.mediaType}/${it.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2 transition hover:bg-white/10"
              >
                <span className="w-5 flex-none text-center text-sm font-black text-gold-300 tabular-nums">{i + 1}</span>
                <span className="h-14 w-10 flex-none overflow-hidden rounded-md bg-white/5">
                  {it.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.posterUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-base font-bold text-white">
                    {it.title} {it.year ? <span className="font-normal text-slate-400">({it.year})</span> : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-black ${CALL_STYLE[it.primaryCall] ?? 'border-white/15 text-slate-200'}`}>{it.primaryCall}</span>
                    <span className="text-sm font-bold tabular-nums text-gold-400">{it.matchScore}</span>
                    <span className="text-xs text-slate-400">match</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {state === 'done' && !error && items.length === 0 && (
        <p className="mt-4 text-sm text-slate-300">No picks came back — tap “Again”.</p>
      )}
    </div>
  );
}
