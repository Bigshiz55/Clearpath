'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { searchBooks, type SearchResponse } from '@/app/actions/books';
import { useStore } from '@/lib/store/StoreProvider';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { BookCover } from '@/components/trial/BookCover';
import { Rating } from '@/components/ui/Rating';
import { ResultGridSkeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';

const EXAMPLES = ['The Silent Patient', 'Project Hail Mary', 'Gone Girl', 'Dune'];

export function SearchExperience({ initialQuery = '' }: { initialQuery?: string }) {
  const store = useStore();
  const [query, setQuery] = useState(initialQuery);
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [pending, start] = useTransition();

  const run = (q: string) => {
    const term = q.trim();
    if (!term) return;
    setQuery(term);
    start(async () => {
      const r = await searchBooks(term);
      setRes(r);
      store.track('search_submitted', { q: term, count: r.books.length, source: r.source });
    });
  };

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="flex items-stretch gap-2"
      >
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a book or author to put on trial…"
          aria-label="Search books"
          autoFocus
        />
        <Button type="submit" disabled={pending}>{pending ? 'Searching…' : 'Search'}</Button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ivory-400">Try:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => run(ex)} className="pill hover:border-copper-400">
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {pending && <ResultGridSkeleton count={4} />}

        {!pending && res && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-ivory-400">
                {res.books.length > 0
                  ? `${res.books.length} result${res.books.length === 1 ? '' : 's'}`
                  : res.state === 'provider_failure'
                    ? 'The book source is unavailable right now.'
                    : 'No matches found.'}
              </p>
              {res.isMock && <Chip tone="brass">Sample data (mock provider)</Chip>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {res.books.map((b) => (
                <Link
                  key={b.workId}
                  href={`/trial/${encodeURIComponent(b.workId)}`}
                  className="card group flex gap-4 p-3 transition hover:border-copper-500/50 hover:bg-ink-850"
                  onClick={() => store.track('book_selected', { workId: b.workId })}
                >
                  <BookCover url={b.coverUrl} title={b.title} className="h-24 w-16 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-lg font-semibold text-ivory-50 group-hover:text-copper-200">
                      {b.title}
                    </h3>
                    <p className="truncate text-sm text-ivory-200">
                      {b.author ?? 'Unknown author'}
                      {b.year != null && <span className="text-ivory-400"> · {b.year}</span>}
                    </p>
                    <div className="mt-2">
                      <Rating value={b.rating ? b.rating.average : null} count={b.rating?.count} />
                    </div>
                  </div>
                  <span className="self-center text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-copper-400">
                    Try it →
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
