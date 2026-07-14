import type { PrimaryCall, VerdictTier, WatchlistDisposition } from '@/lib/types';

const PRIMARY_STYLES: Record<PrimaryCall, string> = {
  'WATCH IT': 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
  MAYBE: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-100',
  'SKIP IT': 'border-red-400/50 bg-red-500/15 text-red-100',
};

export function PrimaryCallBanner({ call, oneLiner }: { call: PrimaryCall; oneLiner?: string }) {
  return (
    <div className={`card flex flex-col items-center gap-1 border px-6 py-6 text-center ${PRIMARY_STYLES[call]}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">The verdict</div>
      <div className="text-4xl font-extrabold tracking-tight sm:text-5xl">{call}</div>
      {oneLiner && <p className="mt-1 max-w-xl text-sm opacity-90">{oneLiner}</p>}
    </div>
  );
}

const TIER_STYLES: Record<VerdictTier, string> = {
  'Must Watch': 'border-verdict-must/50 bg-verdict-must/15 text-emerald-200',
  'Strong Watch': 'border-verdict-strong/50 bg-verdict-strong/15 text-green-200',
  'Worth Watching': 'border-verdict-worth/50 bg-verdict-worth/15 text-lime-200',
  'Possible Watch': 'border-verdict-possible/50 bg-verdict-possible/15 text-yellow-100',
  'Low Priority': 'border-verdict-low/50 bg-verdict-low/15 text-orange-200',
  Skip: 'border-verdict-skip/50 bg-verdict-skip/15 text-red-200',
};

export function VerdictBadge({ tier, size = 'md' }: { tier: VerdictTier; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass =
    size === 'lg' ? 'px-4 py-2 text-base' : size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${TIER_STYLES[tier]} ${sizeClass}`}
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
