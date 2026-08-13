import { cn } from '@/lib/utils/cn';

/** Book cover with an honest titled fallback when no cover URL is known. */
export function BookCover({
  url,
  title,
  className,
}: {
  url: string | null;
  title: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-ink-700 bg-ink-800 p-2 text-center shadow-book',
          className,
        )}
      >
        <span className="font-display text-xs text-ivory-400">{title}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Cover of ${title}`}
      loading="lazy"
      className={cn('rounded-md border border-ink-700 object-cover shadow-book', className)}
    />
  );
}
