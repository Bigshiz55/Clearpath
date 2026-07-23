import Link from 'next/link';
import type { BookSummary } from '@/lib/books/openLibrary';
import { BookCover } from './BookCover';

export function BookCard({ book }: { book: BookSummary }) {
  const rating =
    book.ratingsAverage != null && book.ratingsCount > 0
      ? `★ ${book.ratingsAverage.toFixed(1)} · ${book.ratingsCount.toLocaleString()} ratings`
      : 'No ratings yet';

  return (
    <Link
      href={`/book/${book.workId}`}
      className="card group flex gap-4 p-3 transition hover:border-accent-500/50 hover:bg-ink-850"
    >
      <BookCover
        coverId={book.coverId}
        title={book.title}
        size="M"
        className="h-28 w-[74px] shrink-0"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-serif text-lg font-semibold text-paper-50 group-hover:text-accent-200">
          {book.title}
        </h3>
        {book.subtitle && (
          <p className="truncate text-sm text-ink-500">{book.subtitle}</p>
        )}
        <p className="mt-0.5 truncate text-sm text-paper-200">
          {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}
          {book.firstPublishYear != null && (
            <span className="text-ink-500"> · {book.firstPublishYear}</span>
          )}
        </p>
        <p className="mt-2 text-xs text-ink-500">{rating}</p>
      </div>
      <span className="self-center text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-accent-400">
        →
      </span>
    </Link>
  );
}
