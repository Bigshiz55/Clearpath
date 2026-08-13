import { cn } from '@/lib/utils/cn';

export type ChipTone = 'neutral' | 'brass' | 'signal' | 'positive' | 'negative';

const tones: Record<ChipTone, string> = {
  neutral: 'border-obsidian-600 bg-obsidian-850 text-ivory-200',
  brass: 'border-brass-500/40 bg-brass-500/10 text-brass-300',
  signal: 'border-signal-500/40 bg-signal-500/10 text-signal-300',
  positive: 'border-verdict-must/40 bg-verdict-must/10 text-verdict-must',
  negative: 'border-verdict-pass/40 bg-verdict-pass/10 text-verdict-pass',
};

/** A static labelled chip. For editable interpretation chips see InterpretationChip. */
export function Chip({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
