import { notFound } from 'next/navigation';
import { VerdictReportView } from '@/components/verdict/VerdictReportView';
import type { VerdictReport, TitleMetadata } from '@/lib/types';

/**
 * TITLE-PAGE harness (MOBILE_HARNESS=1).
 *
 * `/app/title/…` needs a session and a live TMDB key, so the page that had
 * grown to eighteen stacked sections had never been measured end to end. This
 * mounts the REAL `VerdictReportView` over a fixture so the consolidation into
 * a decision block plus four tabs can be checked: that nothing was dropped,
 * that every section is reachable, and that the first screen answers the
 * question people arrive with.
 *
 * The fixture is obviously fake and never leaves this route.
 * A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const TITLE: TitleMetadata = {
  id: 424242,
  mediaType: 'tv',
  title: 'Fixture: The Demonstration Case',
  year: 1951,
  overview:
    'Fixture synopsis. A dedicated detective works cases across a city that is also fictional, in a series that exists only to verify that this template renders every section it claims to.',
  genres: ['Crime', 'Mystery', 'Drama'],
  keywords: ['detective', 'police', 'los angeles', 'police detective', 'lapd', 'mystery'],
  posterPath: null,
  backdropPath: null,
  runtimeMinutes: null,
  episodeRuntimeMinutes: 30,
  numberOfSeasons: 8,
  numberOfEpisodes: 276,
  status: 'Ended',
  contentRating: 'TV-PG',
  voteAverage: 6.5,
  voteCount: 34,
  popularity: 12.5,
  trailerUrl: null,
  originalLanguage: 'en',
  spokenLanguages: ['English'],
  originCountries: ['US'],
  imdbId: 'tt0000000',
} as TitleMetadata;

const REPORT: VerdictReport = {
  title: TITLE,
  general: {
    score: 76,
    breakdown: {
      quality: 73,
      audience: 83,
      watchability: 76,
      engagement: 65,
      execution: 68,
      production: 68,
      dataReliability: 'medium',
    },
    confidence: 'medium',
    sources: [
      { name: 'IMDb', value: 75, raw: '7.5/10', available: true, weight: 0.6 },
      { name: 'TMDB Audience', value: 65, raw: '6.5/10 (34 votes)', available: true, weight: 0.4 },
      { name: 'Rotten Tomatoes', value: null, raw: null, available: false },
      { name: 'Metacritic', value: null, raw: null, available: false },
    ],
    standardScore: 71,
    standardConfidence: 'medium',
  },
  personal: {
    label: 'Your Match',
    score: 88,
    baseScore: 76,
    adjustments: [
      { label: 'Grounded crime drama', points: 6, reason: 'Grounded Crime Drama present (matched: detective, police).', defining: true },
      { label: 'Detective mystery', points: 6, reason: 'Detective Mystery present (matched: detective, police detective).', defining: true },
    ],
  } as VerdictReport['personal'],
  primaryCall: 'WATCH IT',
  tier: 'Strong Watch',
  watchlistDisposition: 'Strict Watchlist',
  oneLiner: 'A strong recommendation — move it up the list.',
  reasonsFor: [
    'Grounded crime drama: a strong personal match (+6).',
    'Detective mystery: a strong personal match (+6).',
    'Highly watchable — approachable format and easy to access.',
  ],
  reasonsAgainst: ['No major red flags — mainly a question of whether the premise grabs you.'],
  contentSignals: [
    { label: 'Violence', level: 'moderate' },
    { label: 'Gore', level: 'unknown' },
    { label: 'Sex & Nudity', level: 'unknown' },
    { label: 'Language', level: 'unknown' },
    { label: 'Drug Use', level: 'unknown' },
    { label: 'Disturbing Themes', level: 'unknown' },
    { label: 'Supernatural Intensity', level: 'none' },
    { label: 'Pacing', level: 'moderate' },
    { label: 'Mystery Complexity', level: 'high', note: 'Puzzle-Forward, Rewards Attention' },
    { label: 'Humor', level: 'low', note: 'Limited / Situational' },
  ],
  providers: { region: 'US', link: null, options: [], available: false },
  similar: [
    { id: 1, mediaType: 'tv', title: 'Fixture: Adam-12', year: 1968, posterPath: null, voteAverage: 7.1 },
    { id: 2, mediaType: 'tv', title: 'Fixture: Major Case', year: 2001, posterPath: null, voteAverage: 7.3 },
  ],
  generatedAt: '2026-07-28T00:00:00.000Z',
} as VerdictReport;

export default function ReportTabsHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page space-y-6 py-6" data-testid="report-harness">
      <VerdictReportView report={REPORT} myServices={[]} />
    </main>
  );
}
