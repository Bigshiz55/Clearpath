/**
 * For You dashboard assembler — server-only. Pulls a schedule bundle from a
 * ScheduleProvider, joins airings↔programs↔channels, EXCLUDES sports, applies Your
 * Match, and derives the dashboard sections. Never a mandatory quiz: an
 * unconfigured user gets a cold-start general-quality profile (clearly labelled).
 */
import 'server-only';
import type { ScheduleProvider } from './provider';
import type { PersonalizedAiring, ScheduleQuery } from './types';
import { excludeSports } from './sports';
import { rankAirings, type Candidate, type RankContext, type TasteProfile, type Ranked } from './rank';
import { assessJoiningLate } from './joiningLate';
import { airingStatus } from './time';

export interface DashSection {
  key: string;
  title: string;
  subtitle: string;
  items: PersonalizedAiring[];
  empty: string;                 // honest empty-state copy
  emptyActions: string[];        // suggested next steps
}
export interface Dashboard {
  sections: DashSection[];
  freshness: { fetchedAt: string; stale: boolean };
  usingMockData: boolean;
  coldStart: boolean;
}

export function defaultColdStartTaste(): TasteProfile {
  return { id: 'me', sampleSize: 0, genreAffinity: {}, dislikedGenres: [], favoriteNetworks: [] };
}

/** Run a parsed natural-language schedule query and return ranked results
 *  (hard filters → Your Match), staying entirely within the On TV experience. */
export async function runQuery(
  provider: ScheduleProvider,
  q: ScheduleQuery,
  opts: { now: number; tz: string; taste?: TasteProfile; userChannelIds?: Set<string>; userProviderIds?: Set<string> },
): Promise<PersonalizedAiring[]> {
  const bundle = await provider.getAirings({ now: opts.now, horizonMs: 24 * 3_600_000, networks: q.networks, movieOnly: q.mediaTypes[0] === 'movie' });
  const ctx: RankContext = {
    now: opts.now, tz: opts.tz,
    userChannelIds: opts.userChannelIds ?? new Set(Object.values(bundle.channels).filter((c) => c.isFavorite).map((c) => c.id)),
    userProviderIds: opts.userProviderIds ?? new Set(['cable-basic', 'ota']),
  };
  const candidates: Candidate[] = excludeSports(
    bundle.airings.map((a) => ({ airing: a, program: bundle.programs[a.contentId]!, channel: bundle.channels[a.channelId]! })).filter((c) => c.program && c.channel),
  );
  return rankAirings(candidates, q, ctx, opts.taste ?? defaultColdStartTaste()).map((r) => toPersonalized(r, opts.now));
}

function toPersonalized(r: Ranked, now: number): PersonalizedAiring {
  const status = airingStatus(r.airing, now);
  const joiningLate = status.state === 'on_now'
    ? assessJoiningLate({ airing: r.airing, program: r.program, serialized: r.program.eventType === 'episode' && (r.program.genres.some((g) => ['Drama', 'Thriller', 'Mystery', 'Crime'].includes(g))), now })
    : null;
  return { airing: r.airing, program: r.program, channel: r.channel, matchScore: r.matchScore, verdict: r.verdict, match: r.explanation, joiningLate, status };
}

export async function buildForYou(provider: ScheduleProvider, opts: { now: number; tz: string; taste?: TasteProfile; horizonMs?: number; userChannelIds?: Set<string>; userProviderIds?: Set<string> }): Promise<Dashboard> {
  const now = opts.now;
  const horizonMs = opts.horizonMs ?? 12 * 3_600_000;
  const bundle = await provider.getAirings({ now, horizonMs });
  const taste = opts.taste ?? defaultColdStartTaste();
  const ctx: RankContext = { now, tz: opts.tz, userChannelIds: opts.userChannelIds ?? new Set(Object.values(bundle.channels).filter((c) => c.isFavorite).map((c) => c.id)), userProviderIds: opts.userProviderIds ?? new Set() };

  const candidates: Candidate[] = excludeSports(
    bundle.airings
      .map((a) => ({ airing: a, program: bundle.programs[a.contentId]!, channel: bundle.channels[a.channelId]! }))
      .filter((c) => c.program && c.channel),
  );

  const baseQ: ScheduleQuery = { intent: 'live_schedule_search', mediaTypes: [], eventTypesExclude: ['sports'], dateScope: 'today', startTimeMin: null, startTimeMax: null, withinMinutes: null, networks: [], availabilityScope: 'all', minMatch: null, maxRuntime: null, newOnly: false, noNews: false, noReality: false, noReruns: false, familyFriendly: false, noHorror: false, englishAudioOnly: false, household: [], sort: 'personalized_match' };
  const rankFor = (patch: Partial<ScheduleQuery>) => rankAirings(candidates, { ...baseQ, ...patch }, ctx, taste).map((r) => toPersonalized(r, now));

  const onNow = rankFor({ dateScope: 'now' }).filter((p) => p.status.state === 'on_now').slice(0, 8);
  const soon = rankFor({ dateScope: 'today', withinMinutes: 120 }).filter((p) => p.status.state !== 'on_now' && p.status.minutesUntilStart >= 0).sort((a, b) => a.status.minutesUntilStart - b.status.minutesUntilStart).slice(0, 8);
  const movies = rankFor({ dateScope: 'tonight', mediaTypes: ['movie'], sort: 'personalized_match' }).slice(0, 8);
  const moviesToday = movies.length ? movies : rankFor({ dateScope: 'today', mediaTypes: ['movie'] }).filter((p) => p.status.minutesUntilStart >= -30).slice(0, 8);
  const newEps = rankFor({ dateScope: 'tonight', mediaTypes: ['tv'], newOnly: true }).slice(0, 8);
  const yourChannels = rankFor({ dateScope: 'today', availabilityScope: 'user_channels', sort: 'start_time' }).filter((p) => p.status.minutesUntilStart >= -30).slice(0, 10);

  const sections: DashSection[] = [
    { key: 'on_now', title: 'On Now For You', subtitle: 'Airing now, ranked by Your Match', items: onNow, empty: 'No strong matches are on right now.', emptyActions: ['Starting soon', 'Best available', 'Movies later tonight'] },
    { key: 'starting_soon', title: 'Starting Soon', subtitle: 'Strong matches in the next 2 hours', items: soon, empty: 'Nothing notable starts in the next couple of hours.', emptyActions: ['On now', 'Tonight', 'Broaden filters'] },
    { key: 'movies_tonight', title: 'Movies Tonight', subtitle: 'Films airing later today', items: moviesToday, empty: 'No movies are airing tonight.', emptyActions: ['Shows tonight', 'Tomorrow’s movies', 'Streaming alternatives'] },
    { key: 'new_episodes', title: 'New Episodes Tonight', subtitle: 'Fresh episodes we think you’ll like', items: newEps, empty: 'No new episodes on tonight.', emptyActions: ['All shows tonight', 'Movies tonight'] },
    { key: 'your_channels', title: 'Your Channels', subtitle: 'Coming up on your favorites', items: yourChannels, empty: 'No channels configured.', emptyActions: ['Continue with general listings', 'Add provider or region', 'Choose favorite channels'] },
  ];

  return {
    sections,
    freshness: { fetchedAt: bundle.freshness.fetchedAt, stale: bundle.freshness.stale },
    usingMockData: provider.name === 'mock',
    coldStart: taste.sampleSize < 8,
  };
}
