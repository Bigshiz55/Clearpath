'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Poster } from './PosterCard';

interface Result {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  overview: string;
  posterUrl: string | null;
  voteAverage: number | null;
}

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Search failed.');
          setResults([]);
        } else {
          setError(null);
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search a movie or TV show…"
          className="input pl-11 pr-10"
          aria-label="Search for a movie or TV show"
        />
        {loading && (
          <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-[70vh] w-full overflow-auto rounded-2xl border border-white/10 bg-ink-850/95 p-2 shadow-card backdrop-blur">
          {results.map((r) => (
            <Link
              key={`${r.mediaType}-${r.id}`}
              href={`/app/title/${r.mediaType}/${r.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/5"
            >
              <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-md">
                <Poster posterUrl={r.posterUrl} title={r.title} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">{r.title}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                    {r.mediaType === 'movie' ? 'Movie' : 'TV'}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {r.year ?? '—'}
                  {r.voteAverage ? ` · ★ ${r.voteAverage.toFixed(1)}` : ''}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{r.overview}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && results.length === 0 && !error && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-white/10 bg-ink-850/95 p-4 text-sm text-slate-400 shadow-card">
          No matches for “{q}”. Try a different spelling or the original title.
        </div>
      )}
    </div>
  );
}
