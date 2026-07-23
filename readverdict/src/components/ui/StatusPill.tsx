import { cn } from '@/lib/utils/cn';

// The lifecycle statuses tracked in My Books (Phase 6).
export type BookStatus =
  | 'Saved'
  | 'Interested'
  | 'Reading'
  | 'Finished'
  | 'DNF'
  | 'Paused'
  | 'Want to reread';

const styles: Record<BookStatus, string> = {
  Saved: 'border-obsidian-600 bg-obsidian-850 text-ivory-200',
  Interested: 'border-signal-500/40 bg-signal-500/10 text-signal-300',
  Reading: 'border-brass-500/40 bg-brass-500/10 text-brass-300',
  Finished: 'border-verdict-must/40 bg-verdict-must/10 text-verdict-must',
  DNF: 'border-verdict-pass/40 bg-verdict-pass/10 text-verdict-pass',
  Paused: 'border-verdict-maybe/40 bg-verdict-maybe/10 text-verdict-maybe',
  'Want to reread': 'border-verdict-worth/40 bg-verdict-worth/10 text-verdict-worth',
};

export function StatusPill({
  status,
  className,
}: {
  status: BookStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        styles[status],
        className,
      )}
    >
      {status}
    </span>
  );
}
