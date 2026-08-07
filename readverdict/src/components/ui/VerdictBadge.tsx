import type { VerdictTier } from '@/lib/verdict/tiers';
import { cn } from '@/lib/utils/cn';

const styles: Record<VerdictTier, string> = {
  'Must Read': 'bg-verdict-must/15 text-verdict-must border-verdict-must/40',
  'Strong Yes': 'bg-verdict-strong/15 text-verdict-strong border-verdict-strong/40',
  'Worth a Look': 'bg-verdict-worth/15 text-verdict-worth border-verdict-worth/40',
  Maybe: 'bg-verdict-maybe/15 text-verdict-maybe border-verdict-maybe/40',
  'Probably Pass': 'bg-verdict-pass/15 text-verdict-pass border-verdict-pass/40',
};

/** The verdict tier chip. Color is never the only signal — the label carries it. */
export function VerdictBadge({
  tier,
  className,
}: {
  tier: VerdictTier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold',
        styles[tier],
        className,
      )}
    >
      {tier}
    </span>
  );
}
