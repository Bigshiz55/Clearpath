'use client';

import { cn } from '@/lib/utils/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Accessible single-select segmented control (e.g. grid/list view toggle). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-xl border border-obsidian-600 bg-obsidian-850 p-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-[36px] rounded-lg px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brass-300',
              active ? 'bg-obsidian-700 text-ivory-50' : 'text-ivory-300 hover:text-ivory-100',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
