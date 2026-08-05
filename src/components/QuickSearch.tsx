'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { opensSearch, closesSearch } from '@/lib/search/quickSearch';
import { markSearchRequested, consumeSearchRequest, hasPendingSearchRequest, TRIGGER_ATTR } from '@/lib/search/openRequest';
import { resolveSearchDestination, classifySearchIntent, couldBeTitle, askHref, type CatalogResult } from '@/lib/search/searchIntent';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { SearchBar } from './SearchBar';

/**
 * SEARCH, FROM ANYWHERE.
 *
 * "Somewhere at the top is a search button that's always there no matter what
 * screen you're on. In case something pops in your mind, you're like, I wonder
 * if that was rated good."
 *
 * TWO TRIGGERS, ONE SHEET, AND NEVER BOTH AT ONCE:
 *
 *   • In the header, at every width.
 *   • Floating in the corner ON A PHONE, ONCE THE HEADER HAS SCROLLED AWAY.
 *
 * ── TWO DEFECTS THIS FILE USED TO HAVE ────────────────────────────────────
 *
 * 1. THE BUTTON DID NOTHING, especially on a phone. The triggers talked to the
 *    sheet through a one-shot CustomEvent, which is delivered only to whoever
 *    is already listening. On a slow device the trigger hydrates first, the
 *    event lands in an empty room, and the tap is silently lost. Now a request
 *    also PERSISTS on `<html>` and the sheet claims it on mount — see
 *    src/lib/search/openRequest.ts. A pre-hydration listener records taps that
 *    land before any JavaScript has run at all.
 *
 * 2. EVERY QUERY WENT TO THE JUDGE. The sheet was a plain form wired to
 *    `quickSearchHref`, which routed everything to /app/ask — so searching
 *    "CSI: NY" asked for a recommendation and returned something unrelated.
 *    The sheet now hosts the REAL search box (`SearchBar`), which queries
 *    /api/search, shows live catalog results and people, and only hands over
 *    to the Judge when the query is genuinely a request.
 */
const OPEN_EVENT = 'wv:quick-search';

/**
 * Ask for the search sheet, from anywhere in the tree.
 *
 * Marks FIRST, then shouts. If the sheet is listening it opens immediately and
 * consumes the mark; if it is not, the mark is waiting when it mounts. In that
 * order there is no sequence in which the request is lost.
 */
export function openQuickSearch(): void {
  if (typeof document !== 'undefined') markSearchRequested(document.documentElement);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** How far down the page the header is gone on a phone. */
const HEADER_GONE = 140;

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/**
 * A REAL SEARCH BOX AT DESKTOP WIDTHS — not an icon that opens one.
 *
 * Only from `xl` (1280px+), where the header genuinely has a free middle;
 * below that the icon + sheet is the always-there control.
 *
 * ON SUBMIT IT SEARCHES THE CATALOG. It used to route every query to
 * /app/ask, so an exact title typed here produced a Judge recommendation
 * instead of the title. Now it asks /api/search first and opens the exact
 * match when there is one — see `resolveSearchDestination`. A genuine
 * recommendation request skips the lookup entirely, because it has no title
 * to find.
 */
export function HeaderSearchBar({ className = '' }: { className?: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  // Monotonic: a slow earlier submit must never navigate over a newer one.
  const seq = useRef(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    // An empty box does NOTHING — navigating would cost the screen you were on.
    if (!query) return;

    const mine = ++seq.current;

    // A LONG request needs no catalog round trip; a sentence is never a title.
    // A SHORT one is still looked up, because "Show Me a Hero" and "Anything
    // Goes" read like requests and are real titles — the catalog settles it.
    if (classifySearchIntent(query) === 'ask' && !couldBeTitle(query)) {
      setQ('');
      router.push(askHref(query)!);
      return;
    }

    setBusy(true);
    let results: CatalogResult[] = [];
    try {
      const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { results?: CatalogResult[] };
      if (res.ok) results = data.results ?? [];
    } catch {
      // Offline or slow: fall through with no results, which resolves to the
      // Judge rather than a dead end.
    }
    if (mine !== seq.current) return; // superseded by a newer submit
    setBusy(false);

    const dest = resolveSearchDestination(query, results);
    if (!dest) return;
    setQ('');
    router.push(dest.href);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={`w-full max-w-md ${className}`} role="search">
      <div className="flex h-10 items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 transition focus-within:border-brand-400/60 focus-within:bg-white/[0.07]">
        <SearchIcon className="h-4 w-4 flex-none text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="A title, a person, or what you feel like…"
          aria-label="Search titles, people and questions"
          data-testid="header-search-bar"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
        {busy && (
          <span
            aria-hidden
            data-testid="header-search-busy"
            className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-white/20 border-t-brand-400"
          />
        )}
      </div>
    </form>
  );
}

/**
 * The header's search control.
 *
 * `TRIGGER_ATTR` is what makes the first tap reliable: the pre-hydration
 * listener in the document watches for it, so a tap landing before React has
 * hydrated is still recorded. The React onClick is the fast path, not the only
 * path.
 */
export function QuickSearchTrigger({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      {...{ [TRIGGER_ATTR]: '' }}
      onClick={openQuickSearch}
      aria-label="Search titles, people and questions"
      title="Search (⌘K)"
      data-testid="header-search"
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 transition hover:border-brand-400/60 hover:bg-white/10 hover:text-white ${className}`}
    >
      <SearchIcon className="h-5 w-5" />
    </button>
  );
}

export function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(false);
  const pathname = usePathname();

  /**
   * CLOSING IS WHAT CLEARS THE REQUEST — see openRequest.ts. While the sheet is
   * open the mark stays on `<html>`, so if React tears the tree down and
   * rebuilds it (which it does after any hydration mismatch) the sheet comes
   * back instead of silently disappearing mid-search.
   */
  const close = useCallback(() => {
    setOpen(false);
    consumeSearchRequest(document.documentElement);
  }, []);

  /**
   * ON MOUNT: honour a request made before this component existed.
   * ON NAVIGATION: close, because the sheet must not sit over the page you just
   * asked for. Also resets the floating trigger, since a new page starts at the
   * top with the header visible again.
   *
   * One effect for both so the order is unambiguous — a separate
   * `[pathname]` effect also fires on mount and would clear the very request
   * this one is trying to honour.
   *
   * It compares the PATH rather than counting runs, because React's strict mode
   * (on in development) mounts, unmounts and mounts again on purpose: a "have I
   * run before" flag reads that rehearsal as a navigation and closes the sheet
   * the instant it opens.
   */
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current === null) {
      lastPath.current = pathname;
      if (hasPendingSearchRequest(document.documentElement)) setOpen(true);
      return;
    }
    if (lastPath.current === pathname) return; // same screen — nothing happened
    lastPath.current = pathname;
    setOpen(false);
    setFloating(false);
    consumeSearchRequest(document.documentElement);
  }, [pathname]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // The floating trigger only exists while the header's own one is off screen.
  useEffect(() => {
    const onScroll = () => setFloating(window.scrollY > HEADER_GONE);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open && opensSearch(e)) {
        e.preventDefault();
        // Through the same mark-then-open path as a tap, so ⌘K survives a
        // remount exactly like every other way of asking.
        openQuickSearch();
        return;
      }
      if (open && closesSearch(e)) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Stop the page behind from scrolling under the sheet. SearchBar focuses its
  // own field via `autoFocus`.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Phone only, and only once the header is gone. `sm:hidden` because from
          `sm` the header is sticky and already carries the trigger. */}
      {floating && !open && (
        <button
          type="button"
          {...{ [TRIGGER_ATTR]: '' }}
          onClick={openQuickSearch}
          aria-label="Search titles, people and questions"
          title="Search"
          data-testid="floating-search"
          className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-ink-900/95 text-slate-100 shadow-lg transition hover:border-brand-400/60 hover:text-white active:scale-95 sm:hidden"
        >
          <SearchIcon className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-950/85 backdrop-blur-sm"
          data-testid="quick-search-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="mt-[calc(env(safe-area-inset-top)+3.5rem)] w-full max-w-2xl px-4">
            <div className="flex items-start gap-2">
              {/* THE REAL SEARCH BOX, not a form that guesses. Live catalog
                  results, people, voice, and Enter that opens the exact title
                  when there is one. */}
              <div className="min-w-0 flex-1">
                <SearchBar
                  autoFocus
                  inputTestId="quick-search-input"
                  submitTestId="quick-search-submit"
                  onNavigate={close}
                />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                data-testid="quick-search-close"
                className="grid h-11 w-11 flex-none place-items-center rounded-lg text-2xl leading-none text-slate-400 transition hover:text-white"
              >
                ×
              </button>
            </div>
            <p className="mt-2 px-1 text-xs text-slate-500">
              Was that any good? Ask from any screen — you come straight back to where you were.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
