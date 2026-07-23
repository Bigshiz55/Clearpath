import { cn } from '@/lib/utils/cn';

/** A hairline divider, optionally with a centered label. */
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) {
    return <hr className={cn('border-obsidian-700/70', className)} />;
  }
  return (
    <div className={cn('flex items-center gap-3', className)} role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-obsidian-700/70" />
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-ivory-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-obsidian-700/70" />
    </div>
  );
}
