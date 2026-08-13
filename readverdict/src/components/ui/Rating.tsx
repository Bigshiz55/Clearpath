import { starBreakdown, MAX_STARS } from '@/lib/ui/stars';
import { cn } from '@/lib/utils/cn';

function StarShape({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z"
        fill={filled ? 'currentColor' : 'transparent'}
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A half-filled star via width-clip overlay — deterministic, no SVG ids. */
function HalfStar() {
  return (
    <span className="relative inline-block h-4 w-4">
      <StarShape filled={false} />
      <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
        <StarShape filled />
      </span>
    </span>
  );
}

/**
 * Star rating display. When there is no value it says so plainly — ReadVerdict
 * never shows a fabricated rating.
 */
export function Rating({
  value,
  count,
  className,
}: {
  value: number | null;
  count?: number;
  className?: string;
}) {
  if (value == null) {
    return <span className={cn('text-xs text-ivory-400', className)}>No rating yet</span>;
  }
  const { full, half, empty } = starBreakdown(value);
  const label = `${value.toFixed(1)} of ${MAX_STARS} stars${count != null ? ` from ${count} ratings` : ''}`;
  return (
    <span className={cn('inline-flex items-center gap-1 text-brass-400', className)} title={label}>
      <span className="flex" role="img" aria-label={label}>
        {Array.from({ length: full }).map((_, i) => (
          <StarShape key={`f${i}`} filled />
        ))}
        {half === 1 && <HalfStar />}
        {Array.from({ length: empty }).map((_, i) => (
          <StarShape key={`e${i}`} filled={false} />
        ))}
      </span>
      {count != null && <span className="text-xs text-ivory-400">({count.toLocaleString()})</span>}
    </span>
  );
}
