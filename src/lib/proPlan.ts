/**
 * Pro plan definition (pure, client-safe) — pricing + the feature list shown on
 * the upgrade page. Kept separate from the server-only entitlement reader so the
 * UI can import it freely.
 */

export const PRO_PRICE_USD = 3.99;
export const PRO_PRICE_LABEL = '$3.99/mo';

/**
 * Cause pledge shown on Pro: $1 of every membership, every month, goes to
 * breast cancer research. This is a WatchVerdict pledge funded by memberships —
 * NOT a separate tax-deductible gift by the member, so copy never implies that.
 * TODO before launch: name the specific 501(c)(3) partner in `charity` (e.g.
 * the Breast Cancer Research Foundation) once the arrangement is confirmed.
 */
export const PLEDGE = {
  amountUsd: 1,
  cause: 'breast cancer research',
  charity: null as string | null, // e.g. 'the Breast Cancer Research Foundation'
} as const;

export const pledgeLabel = () => `$${PLEDGE.amountUsd}/mo to ${PLEDGE.cause}`;

export interface ProFeature {
  emoji: string;
  title: string;
  blurb: string;
}

export const PRO_FEATURES: ProFeature[] = [
  {
    emoji: '🧠',
    title: 'AI-tuned verdicts',
    blurb: 'The bounded AI adjustment refines every title’s DNA score to your exact taste — not just the deterministic blend.',
  },
  {
    emoji: '👨‍👩‍👧',
    title: 'Household profiles',
    blurb: 'Give everyone in the house their own taste DNA, and switch between them in a tap.',
  },
  {
    emoji: '⚖️',
    title: 'Bigger Live Court',
    blurb: 'Host up to 8 people in a Live Court room (free tops out at 3) — perfect for a full watch party.',
  },
  {
    emoji: '🔔',
    title: 'Unlimited reminders',
    blurb: 'Track as many upcoming airings and releases as you want, with no cap.',
  },
  {
    emoji: '🚫',
    title: 'No sponsored rows',
    blurb: 'A clean, ad-free grid — just your recommendations, ranked.',
  },
];

/** Free-tier limits the Pro tier lifts. */
export const FREE_COURT_MAX = 3;
export const PRO_COURT_MAX = 8;
