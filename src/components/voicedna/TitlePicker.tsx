'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PickedTitle } from '@/lib/voicedna/answerCodec';

/**
 * Naming a title, and confirming it on the spot.
 *
 * A typed title is a guess — "The Office" is two shows, "Sherlock" is four
 * things — so every title the interview picks up is rendered back immediately
 * with its poster, year and type. The user says "yes, that's it" or corrects
 * it while the answer is still in mind, rather than meeting a list of
 * unexplained guesses twenty minutes later.
 *
 * If search is unavailable the typed text is kept and clearly marked unconfirmed;
 * it is never silently matched to something.
 */

interface Result extends PickedTitle {
  posterUrl: string | null;
  mediaType?: string;
}

const typeLabel = (t?: string) => (t === 'tv' ? 'Series' : t === 'movie' ? 'Film' : '');

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
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
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
        if (mine !== seq.current) return;
        setSearchOff(data.available === false ? (data.message ?? 'Title search is unavailable.') : null);
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (mine !== seq.current) return;
        setSearchOff('Title search is off right now — type the name and I will check it with you at the end.');
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
    if (text) add({ titleId: null, text });
  }, [query, add]);

  const remove = useCallback((i: number) => {
    onChange(picked.filter((_, idx) => idx !== i));
  }, [picked, onChange]);

  return (
    <div className="mt-4" data-testid="title-picker">
      {picked.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400" data-testid="heard-label">
            {picked.length === 1 ? 'I heard' : `I heard ${picked.length}`}
          </p>
          <ul className="space-y-2" data-testid="picked-titles">
            {picked.map((t, i) => {
              const key = t.titleId ?? `typed-${t.text}`;
              const isConfirmed = t.titleId !== null || confirmed[key] === true;
              return (
                <li key={key} className="wv-vd-titlecard" data-testid="picked-title">
                  {'posterUrl' in t && (t as Result).posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(t as Result).posterUrl ?? ''}
                      alt=""
                      className="wv-vd-poster"
                      data-testid="picked-poster"
                    />
                  ) : (
                    <div className="wv-vd-poster wv-vd-poster--blank" aria-hidden>🎬</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white" data-testid="picked-name">{t.text}</p>
                    <p className="text-xs text-slate-400">
                      {[t.year ?? null, typeLabel((t as Result).mediaType)].filter(Boolean).join(' · ') || 'Not confirmed yet'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!isConfirmed && (
                        <button
                          type="button"
                          onClick={() => setConfirmed((s) => ({ ...s, [key]: true }))}
                          className="rounded-md border border-brand-400/60 bg-brand-500/15 px-2 py-1 text-xs font-bold text-white"
                          data-testid="confirm-title"
                        >
                          Yes, that’s it
                        </button>
                      )}
                      {isConfirmed && t.titleId === null && (
                        <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-slate-300" data-testid="title-confirmed">
                          Confirmed
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="rounded-md border border-white/15 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10"
                        data-testid="remove-title"
                      >
                        {t.titleId === null && !isConfirmed ? 'Wrong title' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
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
            placeholder={placeholder ?? 'Start typing a title'}
            autoComplete="off"
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400/60 focus:outline-none"
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
                    className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:border-brand-400/60 hover:bg-white/10"
                    data-testid="title-result"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{r.text}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {[r.year ?? '—', typeLabel(r.mediaType)].filter(Boolean).join(' · ')}
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
              className="mt-2 w-full rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/10"
              data-testid="add-typed-title"
            >
              Use “{query.trim()}” anyway
            </button>
          )}

          {searchOff && (
            <p className="mt-2 text-xs text-amber-200/80" data-testid="search-unavailable">{searchOff}</p>
          )}
        </>
      )}
    </div>
  );
}
