'use client';

import type { PrimaryCall, VerdictTier, WatchlistDisposition } from '@/lib/types';
import { verdictVisualForCall, verdictVisualForTier } from '@/lib/verdictVisual';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Verdict display chips. The tier/call/disposition VALUES stay language-neutral
 * enums coming from the pure scoring engine (never edited); only the on-screen
 * label is localized here, keyed off the stable enum. When rendered outside the
 * app's i18n provider (e.g. a public share page), translation is missing and we
 * fall back to the original English string — never a raw key.
 *
 * NOTE: verdict tiers/calls are branded terminology flagged for native-speaker
 * transcreation review (see the i18n coverage report).
 */
const TIER_KEY: Record<string, string> = {
  'Must Watch': 'mustWatch',
  'Strong Watch': 'strongWatch',
  'Worth Watching': 'worthWatching',
  'Possible Watch': 'possibleWatch',
  'Low Priority': 'lowPriority',
  Skip: 'skip',
};
const CALL_KEY: Record<string, string> = {
  'WATCH IT': 'watchIt',
  MAYBE: 'maybe',
  'SKIP IT': 'skipIt',
};
const DISPOSITION_KEY: Record<string, string> = {
  'Strict Watchlist': 'strict',
  'Possible Watchlist': 'possible',
  Skip: 'skip',
};

/** Translate by key, falling back to the given English text if the key is
 *  missing or we're outside the i18n provider. */
function useLabel() {
  const { t } = useI18n();
  return (key: string, fallback: string) => {
    const r = t(key);
    return r === key ? fallback : r;
  };
}

export function PrimaryCallBanner({ call, oneLiner }: { call: PrimaryCall; oneLiner?: string }) {
  const v = verdictVisualForCall(call);
  const label = useLabel();
  return (
    <div className={`card flex flex-col items-center gap-1 border px-6 py-6 text-center ${v.badge}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">{label('verdict.header', 'The verdict')}</div>
      <div className="text-4xl font-extrabold tracking-tight sm:text-5xl">{label(`verdict.primaryCall.${CALL_KEY[call] ?? ''}`, call)}</div>
      {oneLiner && <p className="mt-1 max-w-xl text-sm opacity-90">{oneLiner}</p>}
    </div>
  );
}

export function VerdictBadge({ tier, size = 'md' }: { tier: VerdictTier; size?: 'sm' | 'md' | 'lg' }) {
  const label = useLabel();
  const sizeClass =
    size === 'lg' ? 'px-4 py-2 text-base' : size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold ${verdictVisualForTier(tier).badge} ${sizeClass}`}
    >
      {label(`verdict.tier.${TIER_KEY[tier] ?? ''}`, tier)}
    </span>
  );
}

export function DispositionChip({ disposition }: { disposition: WatchlistDisposition }) {
  const label = useLabel();
  const style =
    disposition === 'Strict Watchlist'
      ? 'border-brand-400/50 bg-brand-500/15 text-brand-100'
      : disposition === 'Possible Watchlist'
        ? 'border-gold-400/40 bg-gold-500/10 text-amber-100'
        : 'border-white/15 bg-white/5 text-slate-300';
  return <span className={`chip border ${style}`}>{label(`verdict.disposition.${DISPOSITION_KEY[disposition] ?? ''}`, disposition)}</span>;
}
