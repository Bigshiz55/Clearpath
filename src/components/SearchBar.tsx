'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Poster } from './PosterCard';
import { SearchResultRow } from './search/SearchResultRow';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { classifySearchIntent, resolveSearchDestination, couldBeTitle, askHref, lexicalIntent, type LexicalIntent } from '@/lib/search/searchIntent';
import { consumeSearchRequest, searchRequestHost } from '@/lib/search/openRequest';

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

interface Person {
  id: number;
  name: string;
  knownFor: string;
  profileUrl: string | null;
}

export function SearchBar({
  autoFocus = false,
  inputTestId,
  submitTestId,
  onNavigate,
}: {
  autoFocus?: boolean;
  /** Lets a host (the QuickSearch sheet) keep its established test hooks. */
  inputTestId?: string;
  /** Renders a visible Search button — a phone sheet needs one; the home
   *  page's box does not, because Enter is right there on the keyboard. */
  submitTestId?: string;
  /** Called just before navigating, so a sheet can close itself. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  /** The query `results` came from — so Enter never reuses another query's. */
  const [resultsFor, setResultsFor] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  /** Browse intent for a bare genre/provider/subject/network word. */
  const [intent, setIntent] = useState<LexicalIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  // Monotonic request id: a slower earlier fetch must never overwrite a newer
  // query's results (prevents stale results appearing behind a new query).
  const seqRef = useRef(0);

  // Resolve voice support AFTER mount only. Computing it from `window` during
  // render makes the server (no window → false) and first client render (true)
  // disagree, which is a hydration mismatch (React #418). Start false on both
  // sides, then reveal the mic once mounted.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => {
    setVoiceSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }, []);

  /**
   * IS THIS A REQUEST OR A LOOKUP?
   *
   * Was a local heuristic that treated any five-word query as a request, which
   * silently sent every long TITLE to the Judge ("Everything Everywhere All at
   * Once" is five words). Now shared with the header bar and the sheet so all
   * three entry points agree — see src/lib/search/searchIntent.ts.
   */
  function isRequest(text: string): boolean {
    return classifySearchIntent(text) === 'ask';
  }
  /**
   * EVERY WAY OUT OF SEARCH GOES THROUGH HERE.
   *
   * The old code called `onNavigate` only on the explicit Search-button path,
   * so the button closed the sheet correctly while tapping a RESULT left the
   * modal overlay mounted on top of the page it had just opened — the black
   * screen. Three things have to happen, in this order, before the browser
   * moves:
   *
   *   1. the results dropdown closes,
   *   2. the host sheet is told to close (`onNavigate`),
   *   3. the persisted open-search request is cleared, so the sheet does not
   *      re-open itself on the destination (see lib/search/openRequest).
   *
   * Step 3 matters even with no host: a mark left on `window` by a
   * pre-hydration tap outlives this page, and QuickSearch would honour it on
   * arrival. `onNavigate` normally clears it too — clearing twice is a no-op.
   */
  function leaveForResult() {
    setOpen(false);
    onNavigate?.();
    if (typeof window !== 'undefined') consumeSearchRequest(searchRequestHost());
  }

  function fileWithJudge(text: string) {
    const href = askHref(text);
    if (!href) return;
    leaveForResult();
    router.push(href);
  }

  /**
   * ACT ON A SUBMITTED QUERY.
   *
   * A request goes to the Judge. Anything else is a LOOKUP, and a lookup must
   * find the actual title — so if the debounced results have not landed yet
   * (someone typed and hit Enter straight away, which is the normal case) this
   * fetches them rather than giving up and asking the Judge. That fallback was
   * the bug: pressing Enter quickly on "CSI: NY" produced a recommendation.
   */
  async function go(raw: string) {
    const query = raw.trim();
    // An empty box does NOTHING — navigating would cost the screen you were on.
    if (!query) return;

    // A long request goes straight to the Judge. A short one is still looked
    // up first: "Show Me a Hero" reads like a request and is a real series, and
    // only the catalog can tell the two apart.
    if (isRequest(query) && !couldBeTitle(query)) {
      clearAll();
      fileWithJudge(query);
      return;
    }

    const mine = ++seqRef.current;
    // Reuse what is already on screen only when it belongs to THIS query.
    let found = resultsFor === query ? results : [];
    if (found.length === 0) {
      setLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (res.ok) found = data.results ?? [];
      } catch {
        // Fall through with nothing; resolve() hands it to the Judge.
      }
      if (mine !== seqRef.current) return; // a newer query superseded this one
      setLoading(false);
    }

    const dest = resolveSearchDestination(query, found);
    if (!dest) return;
    clearAll();
    leaveForResult();
    router.push(dest.href);
  }

  /** Reset the field so it's ready for the next search (after firing one, or via
   *  the clear button). Without this the query lingered after you searched. */
  function clearAll() {
    setQ('');
    setResults([]);
    setResultsFor('');
    setPeople([]);
    setError(null);
    setOpen(false);
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
      if (isRequest(said)) fileWithJudge(said);
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
      setPeople([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Never let a stale error/result set linger behind a NEW query (the "Sniper
    // the last hand" case, where an old error message covered fresh content).
    setError(null);
    const mySeq = ++seqRef.current;
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (mySeq !== seqRef.current) return; // a newer query superseded this one
        if (!res.ok) {
          setError(data.error ?? 'Search failed.');
          setResults([]);
          setPeople([]);
        } else {
          setError(null);
          setResults(data.results ?? []);
          setResultsFor(query);
          setPeople(data.people ?? []);
          setIntent((data.intent as LexicalIntent | null) ?? lexicalIntent(query));
          setOpen(true);
        }
      } catch {
        if (mySeq === seqRef.current) setError('Network error. Please try again.');
      } finally {
        if (mySeq === seqRef.current) setLoading(false);
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
          onFocus={(e) => {
            if (results.length) setOpen(true);
            // When the on-screen keyboard opens, keep the field (and its results)
            // in view instead of hidden behind the keyboard.
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            void go(q);
          }}
          placeholder="Search by title, actor, genre, or platform…"
          className="w-full rounded-2xl border-2 border-white/25 bg-white/[0.07] py-4 pl-12 pr-11 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white/[0.1] focus:ring-4 focus:ring-brand-500/25 shadow-[0_12px_40px_-14px_rgba(0,0,0,0.75)] min-h-[56px]"
          aria-label="Search for a movie, show, actor, or director"
          {...(inputTestId ? { 'data-testid': inputTestId } : {})}
        />
        {loading && (
          <span className="absolute right-12 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        )}
        {/* When the box has text, show a Clear (×) — tap to wipe it and search
            again. When it's empty, the mic returns. */}
        {q ? (
          <button
            type="button"
            onClick={clearAll}
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white"
            aria-label="Clear search"
            title="Clear"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        ) : voiceSupported ? (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className={`absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg transition ${
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
        ) : null}
      </div>

      {/* A VISIBLE SEARCH BUTTON, only where one is needed. The phone sheet
          gets one because a thumb should not have to find the keyboard's
          return key; the home page's box does not, because Enter is already
          the obvious action there. Full width and 48px so it is a real target
          under a thumb. */}
      {submitTestId && (
        <button
          type="button"
          onClick={() => void go(q)}
          data-testid={submitTestId}
          className="btn-primary mt-2 min-h-[48px] w-full text-sm"
        >
          Search
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {open && (results.length > 0 || people.length > 0 || intent != null) && (
        <div className="absolute z-30 mt-2 max-h-[75vh] w-full overflow-auto rounded-2xl border border-white/10 bg-ink-850/95 p-3 shadow-card backdrop-blur">
          {/* A bare genre/provider/subject/network word is a BROWSE, visually
              distinct from title rows — "crime" offers Browse Crime, never a
              film that merely shares the word. */}
          {intent != null && (
            <Link
              href={intent.kind === 'network' && intent.packHref ? intent.packHref : askHref(q) ?? '#'}
              onClick={leaveForResult}
              data-testid="search-intent-card"
              className="mb-3 flex min-h-[52px] items-center gap-3 rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 py-2.5 hover:bg-brand-500/25"
            >
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-brand-500/25 text-base">
                {intent.kind === 'provider' ? '📺' : intent.kind === 'network' ? '🏛️' : '🎬'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-brand-50">
                  {intent.kind === 'provider' && `Best on ${intent.label}`}
                  {intent.kind === 'network' && `${intent.label}${intent.packHref ? ' Pack' : ' picks'}`}
                  {intent.kind === 'genre' && `Browse ${intent.label}`}
                  {intent.kind === 'subject' && `Browse ${intent.label} titles`}
                </span>
                <span className="block truncate text-[11px] text-brand-200/80">
                  {intent.kind === 'provider' ? 'What’s worth watching there — scored for you' : 'Scored for you by the Judge'}
                </span>
              </span>
            </Link>
          )}
          {people.length > 0 && (
            <div className="mb-3">
              <div className="eyebrow mb-1.5 text-[11px]">People</div>
              <div className="flex flex-col gap-1">
                {people.map((p) => (
                  <Link
                    key={p.id}
                    href={`/app/person/${p.id}`}
                    onClick={leaveForResult}
                    data-testid={`search-person-${p.id}`}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/10"
                  >
                    <span className="h-11 w-11 flex-none overflow-hidden rounded-full border border-white/10 bg-ink-800">
                      <Poster posterUrl={p.profileUrl} title={p.name} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{p.name}</span>
                      {p.knownFor && <span className="block truncate text-xs text-slate-400">{p.knownFor}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* A PURPOSE-BUILT RESULT, NOT THE GRID CARD. The old dropdown rendered
              the full `PosterCard`, which is one card visually and several
              disconnected targets in practice — most of it was dead to a tap.
              See components/search/SearchResultRow.tsx. A list, because that is
              what this is; the grid belongs on a page with room for one. */}
          {results.length > 0 && (
            <ul className="flex flex-col gap-2" data-testid="search-results">
              {results.map((r) => (
                <SearchResultRow
                  key={`${r.mediaType}-${r.id}`}
                  result={{
                    id: r.id,
                    mediaType: r.mediaType,
                    title: r.title,
                    year: r.year,
                    posterUrl: r.posterUrl,
                    posterPath: r.posterPath,
                  }}
                  onNavigate={leaveForResult}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {open && !loading && q.trim().length >= 2 && results.length === 0 && people.length === 0 && !error && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-white/10 bg-ink-850/95 p-4 text-sm text-slate-400 shadow-card">
          No matches for “{q}”. Try a different spelling or the original title.
        </div>
      )}
    </div>
  );
}
