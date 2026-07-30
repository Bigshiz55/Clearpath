/**
 * A SAMPLE IMPORT, FOR TRYING THE GAME WITHOUT ONE.
 *
 * Rapid Fire only makes sense on top of somebody's viewing history, which is a
 * chicken-and-egg problem for anyone evaluating it: you cannot see whether the
 * game is any good until you have handed over a Netflix export. So this is a
 * realistic stand-in — a plausible year of watching, with the messy shape a
 * real file has rather than a tidy list of hits.
 *
 * IT IS LABELLED AS FAKE EVERYWHERE IT IS USED, and it never writes to the
 * preference log. Sample answers move a sample panel and nothing else. A demo
 * that quietly trained the recommender on invented viewing would poison the
 * exact thing the product claims to protect.
 *
 * What makes it a fair test rather than a showreel:
 *   • Titles nobody universally loves, so the answers are real choices.
 *   • Series that were abandoned two episodes in — the case the queue puts
 *     first and the one competitors have no data for.
 *   • Rewatches, half-finished seasons and one-off films, in the proportions a
 *     real file has (mostly one-offs).
 *   • Two rows that are obviously somebody else's — a kids' show and a reality
 *     series — so the "wasn't me" path gets exercised rather than admired.
 *
 * No TMDB ids are hard-coded. Posters are resolved by searching the real
 * catalogue for the title, so this file cannot cause a wrong poster to be shown
 * next to a title — the failure mode is a missing image, which is honest.
 *
 * Pure data. The `lastWatched` values are offsets in days, resolved against a
 * `now` the caller supplies, so the sample never ages into nonsense.
 */
import type { Observation } from './rapidFire';

export interface SampleRow {
  title: string;
  mediaType: 'movie' | 'tv';
  /** Days before "now" that it was last watched. */
  daysAgo: number;
  evidence: string;
  context: Observation['context'];
  repeated?: boolean;
  abandoned?: boolean;
}

/** Roughly a year of watching for one person sharing a household profile. */
export const SAMPLE_ROWS: readonly SampleRow[] = [
  // ── Abandoned: the highest-value questions, and the ones nobody else asks ──
  {
    title: 'The Wheel of Time',
    mediaType: 'tv',
    daysAgo: 212,
    context: 'continue_watching',
    abandoned: true,
    evidence: 'You watched 2 episodes of season 1 and stopped.',
  },
  {
    title: 'Foundation',
    mediaType: 'tv',
    daysAgo: 96,
    context: 'continue_watching',
    abandoned: true,
    evidence: 'You watched 3 episodes, then nothing for three months.',
  },
  {
    title: 'The Idol',
    mediaType: 'tv',
    daysAgo: 340,
    context: 'continue_watching',
    abandoned: true,
    evidence: 'You watched 1 episode and never came back.',
  },
  {
    title: 'Emily in Paris',
    mediaType: 'tv',
    daysAgo: 158,
    context: 'continue_watching',
    abandoned: true,
    evidence: 'You watched 4 episodes of season 1 and stopped.',
  },

  // ── Rewatched: behavioural evidence worth confirming ──────────────────────
  {
    title: 'The Bear',
    mediaType: 'tv',
    daysAgo: 24,
    context: 'repeated_viewing',
    repeated: true,
    evidence: 'You watched season 1 twice, eight months apart.',
  },
  {
    title: 'Arrival',
    mediaType: 'movie',
    daysAgo: 61,
    context: 'repeated_viewing',
    repeated: true,
    evidence: 'You watched this three times.',
  },
  {
    title: 'Paddington 2',
    mediaType: 'movie',
    daysAgo: 45,
    context: 'repeated_viewing',
    repeated: true,
    evidence: 'You watched this twice in six weeks.',
  },

  // ── Series watched through ────────────────────────────────────────────────
  {
    title: 'Shogun',
    mediaType: 'tv',
    daysAgo: 38,
    context: 'completed_series',
    evidence: 'You watched 10 episodes across 1 season.',
  },
  {
    title: 'Slow Horses',
    mediaType: 'tv',
    daysAgo: 71,
    context: 'completed_series',
    evidence: 'You watched 18 episodes across 3 seasons, which usually means you stayed with it.',
  },
  {
    title: 'Severance',
    mediaType: 'tv',
    daysAgo: 129,
    context: 'completed_series',
    evidence: 'You watched 9 episodes across 1 season.',
  },
  {
    title: 'Beef',
    mediaType: 'tv',
    daysAgo: 288,
    context: 'completed_series',
    evidence: 'You watched 10 episodes across 1 season.',
  },
  {
    title: 'The Last of Us',
    mediaType: 'tv',
    daysAgo: 401,
    context: 'completed_series',
    evidence: 'You watched 9 episodes across 1 season.',
  },
  {
    title: 'Ripley',
    mediaType: 'tv',
    daysAgo: 183,
    context: 'viewing_history',
    evidence: 'You watched 6 episodes — most of a season.',
  },

  // ── Films: the long tail, and most of a real file ─────────────────────────
  { title: 'Past Lives', mediaType: 'movie', daysAgo: 52, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Oppenheimer', mediaType: 'movie', daysAgo: 205, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Barbie', mediaType: 'movie', daysAgo: 210, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'The Menu', mediaType: 'movie', daysAgo: 300, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Glass Onion', mediaType: 'movie', daysAgo: 355, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Nope', mediaType: 'movie', daysAgo: 420, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Everything Everywhere All at Once', mediaType: 'movie', daysAgo: 470, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Prey', mediaType: 'movie', daysAgo: 268, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'The Northman', mediaType: 'movie', daysAgo: 512, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Bullet Train', mediaType: 'movie', daysAgo: 331, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Aftersun', mediaType: 'movie', daysAgo: 240, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'The Banshees of Inisherin', mediaType: 'movie', daysAgo: 366, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Sicario', mediaType: 'movie', daysAgo: 640, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Dune: Part Two', mediaType: 'movie', daysAgo: 88, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Poor Things', mediaType: 'movie', daysAgo: 143, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Anatomy of a Fall', mediaType: 'movie', daysAgo: 167, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'Nickel Boys', mediaType: 'movie', daysAgo: 31, context: 'viewing_history', evidence: 'You watched this once.' },
  { title: 'The Holdovers', mediaType: 'movie', daysAgo: 195, context: 'viewing_history', evidence: 'You watched this once.' },

  // ── Sampled and dropped almost immediately ────────────────────────────────
  { title: 'Citadel', mediaType: 'tv', daysAgo: 260, context: 'viewing_history', evidence: 'You watched one episode.' },
  { title: 'The Witcher', mediaType: 'tv', daysAgo: 480, context: 'viewing_history', evidence: 'You watched 2 episodes.' },

  // ── Obviously somebody else on the profile ────────────────────────────────
  {
    title: 'Bluey',
    mediaType: 'tv',
    daysAgo: 12,
    context: 'viewing_history',
    evidence: 'You watched 47 episodes across 3 seasons.',
  },
  {
    title: 'Love Is Blind',
    mediaType: 'tv',
    daysAgo: 40,
    context: 'completed_series',
    evidence: 'You watched 12 episodes across 1 season.',
  },
  {
    title: 'Cocomelon',
    mediaType: 'tv',
    daysAgo: 8,
    context: 'repeated_viewing',
    repeated: true,
    evidence: 'You watched 30 episodes, many of them more than once.',
  },
];

/** Resolve the sample into observations against a supplied clock. */
export function sampleObservations(now: number): Observation[] {
  const DAY = 86_400_000;
  return SAMPLE_ROWS.map((r) => ({
    title: r.title,
    mediaType: r.mediaType,
    context: r.context,
    evidence: r.evidence,
    lastWatched: new Date(now - r.daysAgo * DAY).toISOString(),
    ...(r.repeated ? { repeated: true } : {}),
    ...(r.abandoned ? { abandoned: true } : {}),
  }));
}

/** Headline numbers for the "here is what a real import looks like" panel. */
export function sampleStats(): { titles: number; abandoned: number; rewatched: number; bareHistory: number } {
  return {
    titles: SAMPLE_ROWS.length,
    abandoned: SAMPLE_ROWS.filter((r) => r.abandoned).length,
    rewatched: SAMPLE_ROWS.filter((r) => r.repeated).length,
    bareHistory: SAMPLE_ROWS.filter((r) => r.context === 'viewing_history').length,
  };
}
