import type { PrimaryCall, VerdictTier, WatchlistDisposition } from '@/lib/types';
import { verdictVisualForCall, verdictVisualForTier } from '@/lib/verdictVisual';

export function PrimaryCallBanner({ call, oneLiner }: { call: PrimaryCall; oneLiner?: string }) {
  const v = verdictVisualForCall(call);
  return (
    <div className={`card flex flex-col items-center gap-1 border px-6 py-6 text-center ${v.badge}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">The verdict</div>
      <div className="text-4xl font-extrabold tracking-tight sm:text-5xl">{call}</div>
      {oneLiner && <p className="mt-1 max-w-xl text-sm opacity-90">{oneLiner}</p>}
    </div>
  );
}

export function VerdictBadge({ tier, size = 'md' }: { tier: VerdictTier; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'lg' ? 'px-4 py-2 text-base' : size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${verdictVisualForTier(tier).badge} ${sizeClass}`}
    >
      {tier}
    </span>
  );
}

export function DispositionChip({ disposition }: { disposition: WatchlistDisposition }) {
  const style =
    disposition === 'Strict Watchlist'
      ? 'border-brand-400/50 bg-brand-500/15 text-brand-100'
      : disposition === 'Possible Watchlist'
        ? 'border-gold-400/40 bg-gold-500/10 text-amber-100'
        : 'border-white/15 bg-white/5 text-slate-300';
  return <span className={`chip border ${style}`}>{disposition}</span>;
}
