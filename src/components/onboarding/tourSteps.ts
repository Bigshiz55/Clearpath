/**
 * THE TOUR'S CONTENT — separated from the stepper UI so it stays a plain,
 * testable data structure (every step needs a title/body/valid link, not a
 * rendered component) and so the copy can be reviewed without reading JSX.
 *
 * Every `href` below points at a route that exists in this app; the test file
 * asserts that mapping stays true rather than trusting it by inspection.
 */

export interface TourAction {
  label: string;
  href: string;
}

export interface TourStep {
  id: string;
  icon: string; // one emoji, rendered large — matches the rest of the app's icon convention
  title: string;
  body: string;
  bullets?: string[];
  actions?: TourAction[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    icon: '⚖️',
    title: 'Every title stands trial',
    body:
      'Nothing here gets one score. Every title gets tried twice: a general Verd1ct anyone would get, and Your Match — tuned to what you actually like. No made-up numbers, no filler picks to fill a grid.',
  },
  {
    id: 'gavel',
    icon: '🔨',
    title: 'The Gavel & your Docket',
    body:
      "See a pink gavel badge on a poster? Tap it to add that title to your Docket — a running shortlist of what you're weighing tonight.",
    bullets: [
      'A bar appears at the bottom of the screen showing how many you’ve picked.',
      'Add at least 3, and "Hit the Gavel" lights up — tap it for one head-to-head Verd1ct among just your picks.',
      'Tap the gavel again on a poster (or open the bar) to take something off your Docket.',
    ],
    actions: [{ label: 'Go pick some titles', href: '/app/watch' }],
  },
  {
    id: 'dna',
    icon: '🧬',
    title: 'Building your Watch DNA',
    body:
      'The more the app knows about your taste, the sharper Your Match gets. Rate titles you’ve already seen, or answer a few quick questions — either one teaches the same profile.',
    actions: [
      { label: 'Take the Quick Taste Quiz (2 min)', href: '/app/taste-quiz' },
      { label: 'See your Watch DNA so far', href: '/app/dna' },
    ],
  },
  {
    id: 'ask',
    icon: '💬',
    title: 'Just ask, in plain English',
    body:
      'Type what you want the way you’d say it out loud — "something funny under 90 minutes on Netflix" — and get real matches only. A rule like "under 90 minutes" is never quietly relaxed to pad the results.',
    actions: [{ label: 'Try State Your Case', href: '/app/watch' }],
  },
  {
    id: 'beyond',
    icon: '👥',
    title: 'Beyond just you',
    body: 'Three more rooms worth knowing about:',
    bullets: [
      'The Verd1ct Room — decide with friends and family live; guests can join with no account.',
      'Packs — Hallmark Universe, Lifetime Movie Vault, Crime Case Files: dedicated hubs with real schedules and trackers.',
      'On TV — a live guide for what’s actually on right now.',
    ],
    actions: [
      { label: 'The Verd1ct Room', href: '/app/together' },
      { label: 'Packs', href: '/packs' },
      { label: 'On TV', href: '/app/tv' },
    ],
  },
  {
    id: 'ready',
    icon: '🍿',
    title: "That's the whole system",
    body: 'The gavel builds a shortlist, your DNA sharpens every match, and a plain-English ask does the rest. Go find something worth watching.',
    actions: [{ label: 'Start watching', href: '/app' }],
  },
];
