import type { Metadata } from 'next';
import { SearchBar } from '@/components/SearchBar';
import { BookCard } from '@/components/BookCard';
import { searchBooks } from '@/lib/books/openLibrary';

export const metadata: Metadata = {
  title: 'Search',
};

// Always render on request — results depend on the live query.
export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = (searchParams.q ?? '').trim();
  const results = query ? await searchBooks(query, 24) : [];

  return (
    <div className="animate-fade-up">
      <div className="mx-auto max-w-2xl">
        <SearchBar defaultValue={query} autoFocus={!query} />
      </div>

      {query ? (
        <div className="mt-8">
          <p className="mb-4 text-sm text-ink-500">
            {results.length > 0
              ? `${results.length} result${results.length === 1 ? '' : 's'} for “${query}”`
              : `No results for “${query}”`}
          </p>

          {results.length === 0 ? (
            <div className="card p-8 text-center text-paper-200">
              <p>
                Nothing matched that search. Try a different title, an author, or
                check the spelling.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((book) => (
                <BookCard key={book.workId} book={book} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-10 text-center text-ink-500">
          Type a book or author above to get a verdict.
        </p>
      )}
    </div>
  );
}
