// A no-JS-required search box: a plain GET form that navigates to /search.

export function SearchBar({
  defaultValue = '',
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  return (
    <form action="/search" method="get" className="w-full" role="search">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-500">
            <SearchGlyph />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={defaultValue}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={autoFocus}
            required
            placeholder="Search a book or author…"
            aria-label="Search a book or author"
            className="w-full rounded-xl border border-ink-700 bg-ink-850 py-3 pl-11 pr-4 text-paper-50 placeholder:text-ink-500 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
          />
        </div>
        <button type="submit" className="btn-accent">
          Verdict
        </button>
      </div>
    </form>
  );
}

function SearchGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
