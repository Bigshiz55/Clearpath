import { initialsOf, avatarPaletteIndex } from '@/lib/ui/initials';
import { cn } from '@/lib/utils/cn';

// Six calm, on-brand background tints, indexed deterministically by name.
const palette = [
  'bg-brass-500/25 text-brass-100',
  'bg-signal-500/25 text-signal-300',
  'bg-verdict-must/25 text-verdict-must',
  'bg-verdict-maybe/25 text-verdict-maybe',
  'bg-verdict-worth/25 text-verdict-worth',
  'bg-obsidian-600 text-ivory-100',
];

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

/** Initials avatar with a deterministic per-name tint. */
export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const tint = palette[avatarPaletteIndex(name)] ?? palette[palette.length - 1]!;
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold',
        sizes[size],
        tint,
        className,
      )}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
