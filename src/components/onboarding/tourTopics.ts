/**
 * THE TOUR'S CONTENT — a topic picker, not a forced sequence.
 *
 * Every topic here is a self-contained thing someone might want to learn
 * about, not step N of a script everyone has to walk through in order. Kept
 * as a plain, testable data structure (every topic needs a title/body/valid
 * links, not a rendered component) separate from TourHub.tsx so the copy can
 * be reviewed without reading JSX.
 *
 * Every `href` below points at a route that exists in this app; the test
 * file asserts that mapping stays true rather than trusting it by
 * inspection.
 */

export interface TourAction {
  label: string;
  href: string;
}

export interface TourTopic {
  id: string;
  icon: string; // one emoji, rendered large — matches the rest of the app's icon convention
  title: string;
  /** One line for the topic-picker button. */
  teaser: string;
  body: string;
  bullets?: string[];
  actions?: TourAction[];
}

export const TOUR_TOPICS: TourTopic[] = [
  {
    id: 'scoring',
    icon: '⚖️',
    title: 'How the Verd1ct works',
    teaser: 'A general score, Your Match, and how sure we are',
    body:
      'Nothing here gets one score. Every title gets tried twice: a general Verd1ct anyone would get, and Your Match — tuned to what you actually like. Next to it, an honest confidence label (High, Medium, or Early prediction) says how much of your real taste that number is standing on — never a guess dressed up as certainty.',
    actions: [{ label: 'See it on real titles', href: '/app/watch' }],
  },
  {
    id: 'controls',
    icon: '🎴',
    title: 'What the card controls mean',
    teaser: 'For, Against, Save, and the docket circle — illustrated',
    body: 'Every result card carries the same four controls. Here is exactly what each one does.',
  },
  {
    id: 'gavel',
    icon: '🔨',
    title: 'The Gavel & your Docket',
    teaser: 'Shortlist a few titles, get one head-to-head winner',
    body:
      "See a pink gavel badge on a poster? Tap it to add that title to your Docket — a running shortlist of what you're weighing tonight.",
    bullets: [
      'A bar appears at the bottom of the screen showing how many you’ve picked.',
      'Add at least 3, and "Hit the Gavel" lights up — tap it for one head-to-head Verd1ct among just your picks.',
      'Tap the gavel again on a poster (or open the bar) to take something off your Docket.',
    ],
    actions: [
      { label: 'Go pick some titles', href: '/app/watch' },
      { label: 'See a head-to-head Verd1ct', href: '/app/verdict' },
    ],
  },
  {
    id: 'dna',
    icon: '🧬',
    title: 'Building your Watch DNA',
    teaser: 'The more it knows your taste, the sharper Your Match gets',
    body:
      'The more the app knows about your taste, the sharper Your Match gets. Rate titles you’ve already seen, or answer a few quick questions — either one teaches the same profile.',
    bullets: ['Rapid Fire (⚡️) is a quick taste of the idea as a game — nothing tapped there is saved to your DNA yet.'],
    actions: [
      { label: 'Take the Quick Taste Quiz (2 min)', href: '/app/taste-quiz' },
      { label: 'See your Watch DNA so far', href: '/app/dna' },
      { label: 'Bring your taste with you', href: '/import-taste' },
      { label: 'Try Rapid Fire', href: '/app/rapid-fire' },
    ],
  },
  {
    id: 'ask',
    icon: '💬',
    title: 'Just ask, in plain English',
    teaser: 'Type what you want — get real matches only',
    body:
      'Type what you want the way you’d say it out loud — "something funny under 90 minutes on Netflix" — and get real matches only. A rule like "under 90 minutes" is never quietly relaxed to pad the results.',
    // The input box itself only lives on the home hub — /app/watch is the
    // curated recommendations grid, a different screen entirely.
    actions: [{ label: 'Try State Your Case', href: '/app' }],
  },
  {
    id: 'ontv',
    icon: '📺',
    title: 'On TV & the full channel guide',
    teaser: "What's on live TV right now, and the whole cable box",
    body:
      'On TV shows a curated set of what’s on now and coming soon, filterable by movies, genre, or network. Full guide is the cable-box view — every channel we can actually see, next 6 hours, ordered by your taste when you’re signed in. Set a one-tap reminder on anything and it shows up under My reminders.',
    actions: [
      { label: 'On TV', href: '/app/tv' },
      { label: 'Full channel guide', href: '/app/tv?view=guide' },
      { label: 'My reminders', href: '/app/reminders' },
    ],
  },
  {
    id: 'together',
    icon: '👥',
    title: 'The Verdict Room',
    teaser: 'Decide with friends and family, live — no account needed to join',
    body:
      'Start a round, share the link, and everyone rules for or against together in real time — guests can join with no account at all. One Verd1ct comes out the other side for the whole group.',
    actions: [{ label: 'Start a round', href: '/app/together' }],
  },
  {
    id: 'packs',
    icon: '🎬',
    title: 'Packs',
    teaser: 'Hallmark Universe, Lifetime Movie Vault, Crime Case Files',
    body:
      'Dedicated hubs for a specific habit: real premiere schedules and franchise order for Hallmark, an actor-tracking vault for Lifetime, and a normalized case timeline for true crime — all built from real listings, never invented ones.',
    actions: [{ label: 'Open Packs', href: '/packs' }],
  },
  {
    id: 'browse',
    icon: '🍿',
    title: 'Watch Now, New & your Watchlist',
    teaser: "What to stream tonight, what's new, what you've saved",
    body:
      'Watch Now ranks what you can actually stream right now, starting with anything already on your Watchlist. New is the fresh-release wall, filterable by service and rating. Your Watchlist holds everything you’ve saved, searchable and sortable.',
    actions: [
      { label: 'Watch Now', href: '/app/watch' },
      { label: 'New', href: '/app/new' },
      { label: 'Watchlist', href: '/app/watchlist' },
    ],
  },
  {
    id: 'chambers',
    icon: '🏛️',
    title: 'Chambers & Friends',
    teaser: 'Your taste profile, gamified — and who you follow',
    body:
      'Chambers turns your real activity — titles rated, verdicts delivered, streaks kept — into a standing, badges, and a title of your own. Friends lets you follow people by username and see a feed of their recent verdicts.',
    actions: [
      { label: 'Chambers', href: '/app/chambers' },
      { label: 'Friends', href: '/app/friends' },
    ],
  },
  {
    id: 'money',
    icon: '💸',
    title: 'Subscription check & Pro',
    teaser: "Is each service worth it, and what Pro actually unlocks",
    body:
      'Subscription check compares what you pay for each service against how much of it you actually watch, and flags the ones worth cancelling. WatchVerd1ct Pro is the upgrade — AI-tuned verdicts, household profiles, a bigger Verdict Room, unlimited reminders, no ads — while the core scoring engine stays free for everyone.',
    actions: [
      { label: 'Subscription check', href: '/app/subscriptions' },
      { label: 'WatchVerd1ct Pro', href: '/app/pro' },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    title: 'Your account & settings',
    teaser: 'Profile, streaming services, sharing, and preferences',
    body:
      'Everything that shapes your experience lives in one place: your display name and region, which streaming services you have, the preference rules that drive scoring, and your public-activity and sharing controls.',
    actions: [{ label: 'Open Settings', href: '/app/settings' }],
  },
];
