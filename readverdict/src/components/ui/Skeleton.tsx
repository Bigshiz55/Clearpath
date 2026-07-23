import { cn } from '@/lib/utils/cn';

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('skeleton block', className)} aria-hidden="true" />;
}

/** A representative loading placeholder for one recommendation result. */
export function ResultCardSkeleton() {
  return (
    <div className="card flex gap-4 p-4" aria-hidden="true">
      <Skeleton className="h-28 w-[74px] shrink-0 rounded-md" />
      <div className="flex-1 space-y-2.5 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="mt-4 h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** A grid of result skeletons for list/loading states. */
export function ResultGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading results">
      {Array.from({ length: count }).map((_, i) => (
        <ResultCardSkeleton key={i} />
      ))}
    </div>
  );
}
