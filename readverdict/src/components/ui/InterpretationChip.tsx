'use client';

import { cn } from '@/lib/utils/cn';
import type { ChipTone } from './Chip';

const tones: Record<ChipTone, string> = {
  neutral: 'border-obsidian-600 bg-obsidian-850 text-ivory-200',
  brass: 'border-brass-500/40 bg-brass-500/10 text-brass-300',
  signal: 'border-signal-500/40 bg-signal-500/10 text-signal-300',
  positive: 'border-verdict-must/40 bg-verdict-must/10 text-verdict-must',
  negative: 'border-verdict-pass/40 bg-verdict-pass/10 text-verdict-pass',
};

/**
 * An editable interpretation chip — the surface through which a reader confirms
 * or removes what ReadVerdict understood from their request. `onRemove` renders
 * an accessible dismiss control; `muted` shows a struck-through, de-emphasized
 * state for a constraint the reader has toggled off (still visible, undo-able).
 */
export function InterpretationChip({
  label,
  tone = 'brass',
  muted = false,
  onRemove,
  onToggle,
  className,
}: {
  label: string;
  tone?: ChipTone;
  muted?: boolean;
  onRemove?: () => void;
  onToggle?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
        tones[tone],
        muted && 'opacity-45 line-through',
        className,
      )}
    >
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={!muted}
          className="rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="-mr-1 grid h-4 w-4 place-items-center rounded-full text-current/70 hover:bg-current/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
