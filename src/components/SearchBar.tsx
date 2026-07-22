'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PosterCard } from './PosterCard';

interface Result {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
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
  const [listening, setListening] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  const voiceSupported =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  // A spoken/typed *request* ("give me a crime thriller under 2 hours") isn't a
  // title lookup — hand it to the judge, who actually runs it. A short phrase is
  // treated as a title search as before.
  function looksLikeRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (/\b(find|recommend|something|anything|give me|show me|what should|in the mood|tonight|binge|under|over|less than|minutes|hours|recent|new|funny|scary|match|audience|episodes?|movies|films|starring|directed by)\b/.test(t)) return true;
    // "3 sylvester stallone movies", "five comedies" — a count + a plural noun is a
    // request, not a single title. Send it to the judge (which corrects spelling).
    if (/^\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(t) && /\b(movie|film|show|series|comed|thriller|drama|pick)/.test(t)) return true;
    return text.trim().split(/\s+/).length >= 5;
  }
  function fileWithJudge(text: string) {
    router.push(`/app/ask?q=${encodeURIComponent(text.trim())}`);
  }

  function startVoice() {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { webkitSpeechRecognition?: new () => never; SpeechRecognition?: new () => never };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new (Ctor as unknown as new () => Record<string, unknown>)() as Record<string, unknown> & {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: { results: Array<Array<{ transcript: string }>> }) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      if (!said) return;
      // The fix for "I said it but nothing happened": a spoken request is filed
      // with the judge and actually executed, not left sitting in the box.
      if (looksLikeRequest(said)) fileWithJudge(said);
      else setQ(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setListening(false);
  }

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
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-300" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.9" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const query = q.trim();
            if (query.length < 2) return;
            e.preventDefault();
            // Enter always acts: a request goes to the judge; otherwise open the
            // top matching title; if there's no match yet, hand it to the judge.
            if (looksLikeRequest(query)) {
              fileWithJudge(query);
              return;
            }
            const top = results[0];
            if (top) {
              setOpen(false);
              router.push(`/app/title/${top.mediaType}/${top.id}`);
            } else {
              fileWithJudge(query);
            }
          }}
          placeholder="Search for a movie, show, actor, or director…"
          className="w-full rounded-2xl border-2 border-white/25 bg-white/[0.07] py-4 pl-12 pr-11 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white/[0.1] focus:ring-4 focus:ring-brand-500/25 shadow-[0_12px_40px_-14px_rgba(0,0,0,0.75)] min-h-[56px]"
          aria-label="Search for a movie, show, actor, or director"
        />
        {loading && (
          <span className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        )}
        {voiceSupported && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className={`absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg transition ${
              listening ? 'bg-red-500/20 text-red-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
            aria-label={listening ? 'Stop voice search' : 'Search by voice'}
            title={listening ? 'Listening… tap to stop' : 'Search by voice'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {open && results.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-[75vh] w-full overflow-auto rounded-2xl border border-white/10 bg-ink-850/95 p-3 shadow-card backdrop-blur">
          <div className="poster-grid" onClick={() => setOpen(false)}>
            {results.map((r) => (
              <PosterCard
                key={`${r.mediaType}-${r.id}`}
                href={`/app/title/${r.mediaType}/${r.id}`}
                mediaType={r.mediaType}
                tmdbId={r.id}
                title={r.title}
                year={r.year}
                posterUrl={r.posterUrl}
                posterPath={r.posterPath}
              />
            ))}
          </div>
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
