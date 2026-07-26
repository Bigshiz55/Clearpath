'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickedTitle } from '@/lib/voicedna/answerCodec';

/**
 * Naming a title, with confirmation.
 *
 * A hand-typed title is a guess: "The Office" is two different shows and
 * "Sherlock" is four. So search runs as you type and picking a result attaches a
 * real id, which is what lets the follow-up ask genre-appropriate questions.
 *
 * If search is unavailable — no TMDB key, an outage — the typed text is kept
 * anyway and flagged as unconfirmed, and review refuses to save until the user
 * settles it. It never silently guesses a match.
 */

interface Result extends PickedTitle {
  posterUrl: string | null;
  mediaType?: string;
}

export function TitlePicker({
  max,
  picked,
  onChange,
  placeholder,
}: {
  max: number;
  picked: PickedTitle[];
  onChange: (titles: PickedTitle[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOff, setSearchOff] = useState<string | null>(null);
  const seq = useRef(0);

  const full = picked.length >= max;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || full) { setResults([]); return; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/voicedna/titles?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { available?: boolean; results?: Result[]; message?: string };
        if (mine !== seq.current) return; // a newer keystroke won
        setSearchOff(data.available === false ? (data.message ?? 'Title search is unavailable.') : null);
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (mine !== seq.current) return;
        setSearchOff('Title search is unavailable — type the name and I will confirm it with you at the end.');
        setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, full]);

  const add = useCallback((t: PickedTitle) => {
    if (picked.some((p) => (p.titleId && p.titleId === t.titleId) || p.text === t.text)) return;
    onChange([...picked, t].slice(0, max));
    setQuery('');
    setResults([]);
  }, [picked, onChange, max]);

  const addTyped = useCallback(() => {
    const text = query.trim();
    if (!text) return;
    add({ titleId: null, text });
  }, [query, add]);

  const remove = useCallback((i: number) => {
    onChange(picked.filter((_, idx) => idx !== i));
  }, [picked, onChange]);

  return (
    <div className="mt-4" data-testid="title-picker">
      {picked.length > 0 && (
        <ul className="mb-3 space-y-2" data-testid="picked-titles">
          {picked.map((t, i) => (
            <li
              key={`${t.titleId ?? 'typed'}-${t.text}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2"
              data-testid="picked-title"
            >
              <span className="min-w-0 text-sm font-semibold text-white">
                <span className="truncate">{t.text}</span>
                {t.year ? <span className="ml-1 text-slate-400">({t.year})</span> : null}
                {t.titleId === null && (
                  <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                    unconfirmed
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${t.text}`}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
                data-testid="remove-title"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <>
          <label className="sr-only" htmlFor="title-search">Search for a title</label>
          <input
            id="title-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (results[0]) add(results[0]); else addTyped(); }
            }}
            placeholder={placeholder ?? 'Search for a title, or just type it'}
            autoComplete="off"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none"
            data-testid="title-input"
          />

          {searching && <p className="mt-2 text-xs text-slate-500" role="status">Searching…</p>}

          {results.length > 0 && (
            <ul className="mt-2 space-y-1" data-testid="title-results">
              {results.map((r) => (
                <li key={r.titleId ?? r.text}>
                  <button
                    type="button"
                    onClick={() => add(r)}
                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:border-brand-400/60 hover:bg-white/10"
                    data-testid="title-result"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{r.text}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {r.year ?? '—'}{r.mediaType === 'tv' ? ' · Series' : r.mediaType === 'movie' ? ' · Film' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <button
              type="button"
              onClick={addTyped}
              className="mt-2 w-full rounded-lg border border-dashed border-white/20 px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/10"
              data-testid="add-typed-title"
            >
              Use “{query.trim()}” anyway — I will check it with you at the end
            </button>
          )}

          {searchOff && (
            <p className="mt-2 text-xs text-amber-200/80" data-testid="search-unavailable">{searchOff}</p>
          )}
        </>
      )}

      {full && (
        <p className="text-xs text-slate-500" data-testid="picker-full">
          That is {max === 1 ? 'the one' : `all ${max}`} — remove one to swap it.
        </p>
      )}
    </div>
  );
}
