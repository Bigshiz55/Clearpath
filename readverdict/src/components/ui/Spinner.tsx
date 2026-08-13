import { cn } from '@/lib/utils/cn';

/** Accessible loading spinner. Give it a `label` when it stands alone. */
export function Spinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-live={label ? 'polite' : undefined}
      className="inline-flex items-center gap-2"
    >
      <span
        className={cn(
          'h-5 w-5 animate-spin rounded-full border-2 border-obsidian-600 border-t-brass-400',
          className,
        )}
        aria-hidden="true"
      />
      {label && <span className="text-ivory-300">{label}</span>}
    </span>
  );
}
