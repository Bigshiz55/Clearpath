import type { PrimaryCall, VerdictTier } from '@/lib/types';

/** Tailwind text color token for each tier (matches tailwind `verdict.*`). */
export function tierColor(tier: VerdictTier): string {
  switch (tier) {
    case 'Must Read':
      return 'text-verdict-must';
    case 'Strong Read':
      return 'text-verdict-strong';
    case 'Worth Reading':
      return 'text-verdict-worth';
    case 'Possible Read':
      return 'text-verdict-possible';
    case 'Low Priority':
      return 'text-verdict-low';
    case 'Skip':
    default:
      return 'text-verdict-skip';
  }
}

/** Hex value for the tier — used for the SVG score dial stroke. */
export function tierHex(tier: VerdictTier): string {
  switch (tier) {
    case 'Must Read':
      return '#3fa34d';
    case 'Strong Read':
      return '#6bbf59';
    case 'Worth Reading':
      return '#a8c256';
    case 'Possible Read':
      return '#e0b83c';
    case 'Low Priority':
      return '#e08a3c';
    case 'Skip':
    default:
      return '#d1685c';
  }
}

export function callClasses(call: PrimaryCall): string {
  switch (call) {
    case 'READ IT':
      return 'bg-verdict-must/15 text-verdict-must border-verdict-must/40';
    case 'MAYBE':
      return 'bg-verdict-possible/15 text-verdict-possible border-verdict-possible/40';
    case 'SKIP IT':
    default:
      return 'bg-verdict-skip/15 text-verdict-skip border-verdict-skip/40';
  }
}
