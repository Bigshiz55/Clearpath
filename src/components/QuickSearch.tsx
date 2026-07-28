'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { quickSearchHref, opensSearch, closesSearch } from '@/lib/search/quickSearch';

/**
 * SEARCH, FROM ANYWHERE.
 *
 * "Somewhere at the top is a search button that's always there no matter what
 * screen you're on. In case something pops in your mind, you're like, I wonder
 * if that was rated good."
 *
 * The home screen's search box only serves people who are already on the home
 * screen. This is for the thought that arrives while you are halfway down a
 * title page or mid-way through ruling a stack — where acting on it used to
 * cost: leave, go home, scroll up, type, and lose your place.
 *
 * TWO TRIGGERS, ONE SHEET, AND NEVER BOTH AT ONCE:
 *
 *   • In the header, at every width. That is where a search control belongs and
 *     it is what you see at the top of any screen.
 *   • Floating in the corner ON A PHONE, ONCE THE HEADER HAS SCROLLED AWAY.
 *
 * The obvious alternative — stick the header — was rejected on purpose. Header
 * plus build badge is ~148px; sticking it spends that on every screen forever,
 * and "it chops off the top" is a complaint this app has already had once. One
 * 44px circle, and only while it is actually needed, costs nothing by
 * comparison. Above `sm` the header is already sticky, so the floating trigger
 * never appears there — two search buttons on one screen is worse than none.
 *
 * The two are wired by a window event rather than a context so the header can
 * stay a server component.
 */
const OPEN_EVENT = 'wv:quick-search';

/** Ask for the search sheet, from anywhere in the tree. */
export function openQuickSearch(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
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

/** The header's search control. Same destination, same sheet. */
export function QuickSearchTrigger({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
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
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const close = useCallback(() => setOpen(false), []);

  // A navigation closes it — otherwise the sheet sits over the page you just
  // asked for. Also resets the floating trigger, since a new page starts at the
  // top with the header visible again.
  useEffect(() => {
    setOpen(false);
    setFloating(false);
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
        setOpen(true);
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

  // Focus the field, and stop the page behind from scrolling under the sheet.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const href = quickSearchHref(q);
    // An empty box does NOTHING. Navigating would cost you the screen you were
    // on, which is the whole thing this control exists to protect.
    if (!href) {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    setQ('');
    router.push(href);
  }

  return (
    <>
      {/* Phone only, and only once the header is gone. `sm:hidden` because from
          `sm` the header is sticky and already carries the trigger. */}
      {floating && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
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
          <form onSubmit={submit} className="mt-[calc(env(safe-area-inset-top)+3.5rem)] w-full max-w-2xl px-4">
            <div className="card flex items-center gap-2 p-2">
              <SearchIcon className="ml-1.5 h-5 w-5 flex-none text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="A title, a person, or what you feel like…"
                aria-label="Search"
                data-testid="quick-search-input"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-white outline-none placeholder:text-slate-500"
              />
              <button type="submit" className="btn-primary flex-none px-4 py-2 text-sm" data-testid="quick-search-submit">
                Search
              </button>
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
          </form>
        </div>
      )}
    </>
  );
}
