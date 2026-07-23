import { coverUrl, type CoverSize } from '@/lib/books/cover';

/**
 * Book cover with an honest fallback: when Open Library has no cover we render
 * a titled placeholder rather than a broken image or a fake cover.
 */
export function BookCover({
  coverId,
  title,
  size = 'M',
  className = '',
}: {
  coverId: number | null;
  title: string;
  size?: CoverSize;
  className?: string;
}) {
  const url = coverUrl(coverId, size);
  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-ink-700 bg-ink-800 p-3 text-center shadow-spine ${className}`}
      >
        <span className="font-serif text-sm text-ink-500">{title}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Cover of ${title}`}
      loading="lazy"
      className={`rounded-lg border border-ink-700 object-cover shadow-book ${className}`}
    />
  );
}
