// The one WatchVerdict color language. Every surface that signals a call — the
// score badge, a card's accent, a progress bar, a button — routes through here
// so "Watch It" always reads the same green and "Skip It" the same red. Pure and
// client-safe. Keep this the ONLY place these colors are defined.
import type { VerdictTier } from '@/lib/types';

export type VerdictKey = 'watch' | 'worth' | 'uncertain' | 'skip' | 'wildcard';

export interface VerdictVisual {
  key: VerdictKey;
  label: string; // the plain-English call
  hex: string; // accent for inline styles (rings, gradients)
  badge: string; // the score/verdict pill: border + bg + text
  solid: string; // higher-emphasis fill, used to mark the top pick within a color
  border: string; // subtle card accent border
  bar: string; // score-bar fill
  text: string; // accent text
  dot: string; // small status dot
}

const VISUALS: Record<VerdictKey, VerdictVisual> = {
  watch: {
    key: 'watch',
    label: 'Watch It',
    hex: '#34d399',
    badge: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
    solid: 'border-emerald-300/70 bg-emerald-500/30 text-emerald-50',
    border: 'border-emerald-400/40',
    bar: 'bg-emerald-400',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  worth: {
    key: 'worth',
    label: 'Worth a Look',
    hex: '#f5c65a',
    badge: 'border-gold-400/50 bg-gold-500/15 text-amber-100',
    solid: 'border-gold-400/80 bg-gold-500/30 text-amber-50',
    border: 'border-gold-400/40',
    bar: 'bg-gold-400',
    text: 'text-gold-400',
    dot: 'bg-gold-400',
  },
  uncertain: {
    // Gray on navy is the lowest-contrast pairing on the screen and reads as
    // "disabled" — so "Uncertain" gets a lighter, deliberately readable slate.
    key: 'uncertain',
    label: 'Uncertain',
    hex: '#cbd5e1',
    badge: 'border-slate-300/40 bg-slate-400/25 text-slate-100',
    solid: 'border-slate-300/60 bg-slate-400/35 text-white',
    border: 'border-slate-300/25',
    bar: 'bg-slate-300',
    text: 'text-slate-200',
    dot: 'bg-slate-300',
  },
  skip: {
    key: 'skip',
    label: 'Skip It',
    hex: '#f87171',
    badge: 'border-red-400/50 bg-red-500/15 text-red-100',
    solid: 'border-red-300/70 bg-red-500/30 text-red-50',
    border: 'border-red-400/40',
    bar: 'bg-red-400',
    text: 'text-red-300',
    dot: 'bg-red-400',
  },
  wildcard: {
    key: 'wildcard',
    label: 'Wildcard',
    hex: '#a78bfa',
    badge: 'border-violet-400/50 bg-violet-500/15 text-violet-100',
    solid: 'border-violet-300/70 bg-violet-500/30 text-violet-50',
    border: 'border-violet-400/40',
    bar: 'bg-violet-400',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
  },
};

// The six stored tiers collapse into four signal colors — the whole point of a
// consistent language: "Must Watch" and "Strong Watch" must look identical.
const TIER_KEY: Record<VerdictTier, VerdictKey> = {
  'Must Watch': 'watch',
  'Strong Watch': 'watch',
  'Worth Watching': 'worth',
  'Possible Watch': 'worth',
  'Low Priority': 'uncertain',
  Skip: 'skip',
};

const CALL_KEY: Record<string, VerdictKey> = {
  'WATCH IT': 'watch',
  MAYBE: 'worth',
  'SKIP IT': 'skip',
};

export function verdictVisual(key: VerdictKey): VerdictVisual {
  return VISUALS[key];
}

export function verdictVisualForTier(tier: string): VerdictVisual {
  return VISUALS[TIER_KEY[tier as VerdictTier] ?? 'uncertain'];
}

export function verdictVisualForCall(call: string): VerdictVisual {
  return VISUALS[CALL_KEY[call] ?? 'uncertain'];
}

/** The single strongest tier — worth marking as the standout pick even though
 *  it shares the green "watch" family with Strong Watch. */
export function isTopTier(tier: string): boolean {
  return tier === 'Must Watch';
}
