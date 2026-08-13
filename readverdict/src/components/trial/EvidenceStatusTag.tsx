import type { EvidenceStatus } from '@/lib/domain/confidence';
import { cn } from '@/lib/utils/cn';

const META: Record<EvidenceStatus, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'border-verdict-must/40 text-verdict-must bg-verdict-must/10' },
  sourced: { label: 'Sourced', cls: 'border-signal-500/40 text-sage-300 bg-sage-500/10' },
  'user-supplied': { label: 'You said', cls: 'border-copper-500/40 text-copper-300 bg-copper-500/10' },
  inferred: { label: 'Inferred', cls: 'border-gold-400/40 text-gold-300 bg-gold-400/10' },
  estimated: { label: 'Estimate', cls: 'border-gold-400/40 text-gold-300 bg-gold-400/10' },
  'ai-generated': { label: 'AI synthesis', cls: 'border-oxblood-500/40 text-oxblood-400 bg-oxblood-500/10' },
  insufficient: { label: 'Insufficient evidence', cls: 'border-ink-600 text-ivory-400 bg-ink-800' },
};

/** A small tag that always states how strongly a data point is backed. */
export function EvidenceStatusTag({ status, className }: { status: EvidenceStatus; className?: string }) {
  const m = META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]',
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  );
}
