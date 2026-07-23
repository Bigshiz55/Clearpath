import { describe, it, expect } from 'vitest';
import { airingStatus, inDateScope, hhmmToMinutes, localParts } from './time';
import { assessJoiningLate, isPlotDependent } from './joiningLate';
import { applyHardFilters, rankAirings, householdScore, yourMatch, verdictBand, type TasteProfile, type Candidate, type RankContext } from './rank';
import { parseScheduleQuery, applyClarification } from './query';
import { isSportsProgram, isSportsChannel, eventTypeFromRaw } from './sports';
import type { Airing, Program, Channel, ScheduleQuery } from './types';

const TZ = 'America/New_York';
const NOW = Date.parse('2026-03-09T20:30:00-04:00'); // 8:30pm ET (after the DST spring-forward)

const ch = (o: Partial<Channel> & { id: string }): Channel => ({ name: o.id, callSign: o.id, logo: null, network: o.id, channelNumber: null, region: 'US', providerIds: ['ota'], isFavorite: false, isHidden: false, ...o });
const prog = (o: Partial<Program> & { id: string; title: string }): Program => ({ episodeTitle: null, mediaType: 'tv', eventType: 'episode', seasonNumber: null, episodeNumber: null, genres: [], synopsis: null, artwork: null, ratings: null, cast: [], runtime: 60, contentWarnings: [], contentRating: null, ...o });
const air = (o: Partial<Airing> & { id: string; contentId: string; channelId: string; startAt: string; endAt: string }): Airing => ({ isLive: true, isNew: false, isRepeat: false, restartAvailable: false, onDemandAvailable: false, streamingLaterAvailable: false, sourceUpdatedAt: new Date(NOW).toISOString(), ...o });
const at = (min: number) => new Date(NOW + min * 60000).toISOString();

describe('time — status, DST-safe windows', () => {
  it('computes minutes remaining + percent for an on-now airing', () => {
    const s = airingStatus({ startAt: at(-30), endAt: at(30) }, NOW);
    expect(s.state).toBe('on_now');
    expect(s.minutesRemaining).toBe(30);
    expect(s.percentElapsed).toBe(50);
  });
  it('flags starting_soon within 30 min and upcoming beyond', () => {
    expect(airingStatus({ startAt: at(20), endAt: at(80) }, NOW).state).toBe('starting_soon');
    expect(airingStatus({ startAt: at(90), endAt: at(150) }, NOW).state).toBe('upcoming');
  });
  it('classifies tonight/tomorrow in the user timezone', () => {
    expect(inDateScope({ startAt: at(60), endAt: at(120) }, 'tonight', NOW, TZ)).toBe(true);   // 9:30pm ET
    expect(inDateScope({ startAt: at(60), endAt: at(120) }, 'tomorrow', NOW, TZ)).toBe(false);
    expect(inDateScope({ startAt: at(60 * 20), endAt: at(60 * 21) }, 'tomorrow', NOW, TZ)).toBe(true); // +20h → next local day
  });
  it('minute math is DST-correct (epoch based)', () => {
    // 8:30pm on the spring-forward day: an item 90 min out is still +90 real minutes.
    expect(airingStatus({ startAt: at(90), endAt: at(150) }, NOW).minutesUntilStart).toBe(90);
    expect(localParts(NOW, TZ).hour).toBe(20);
  });
  it('hhmm parsing', () => { expect(hhmmToMinutes('20:00')).toBe(1200); });
});

describe('sports exclusion (this phase ships none)', () => {
  it('detects sports program + channel + raw type', () => {
    expect(isSportsProgram({ eventType: 'sports', genres: [], title: 'x' })).toBe(true);
    expect(isSportsProgram({ eventType: 'other', genres: ['Sports'], title: 'x' })).toBe(true);
    expect(isSportsChannel({ callSign: 'ESPN', network: 'ESPN', name: 'ESPN' })).toBe(true);
    expect(eventTypeFromRaw('Sports')).toBe('sports');
    expect(eventTypeFromRaw('Movie')).toBe('movie');
  });
  it('hard filters drop sports even with a huge match', () => {
    const items: Candidate[] = [{ airing: air({ id: 'a', contentId: 'sport:g', channelId: 'ESPN', startAt: at(-10), endAt: at(170) }), program: prog({ id: 'sport:g', title: 'Big Game', eventType: 'sports', genres: ['Sports'], ratings: { imdb: 9.9 } }), channel: ch({ id: 'ESPN' }) }];
    const q = parseScheduleQuery('show me movies but no sports tonight').query;
    const ctx: RankContext = { now: NOW, tz: TZ, userChannelIds: new Set(), userProviderIds: new Set() };
    expect(applyHardFilters(items, q, ctx)).toHaveLength(0);
  });
});

describe('Worth Joining Late — explainable rules', () => {
  const base = { startAt: at(-18), endAt: at(42), restartAvailable: false, onDemandAvailable: false, streamingLaterAvailable: false };
  it('Castle (standalone procedural) started 18m ago → YES', () => {
    const a = assessJoiningLate({ airing: base, program: prog({ id: 'castle', title: 'Castle', genres: ['Crime', 'Comedy'] }), serialized: false, now: NOW });
    expect(a.verdict).toBe('yes');
  });
  it('mystery movie 54m into 118m → NO (available later)', () => {
    const a = assessJoiningLate({ airing: { startAt: at(-54), endAt: at(64), restartAvailable: false, onDemandAvailable: true, streamingLaterAvailable: true }, program: prog({ id: 'm', title: 'Thriller', mediaType: 'movie', eventType: 'movie', genres: ['Thriller'] }), serialized: false, now: NOW });
    expect(a.verdict).toBe('no');
    expect(a.reasonKey).toBe('plot_late_ondemand');
  });
  it('sitcom rerun 9m in → YES', () => {
    const a = assessJoiningLate({ airing: { startAt: at(-9), endAt: at(21), restartAvailable: false, onDemandAvailable: false, streamingLaterAvailable: false }, program: prog({ id: 's', title: 'Sitcom', genres: ['Comedy'] }), serialized: false, now: NOW });
    expect(a.verdict).toBe('yes');
  });
  it('serialized drama 27m into 60m → MAYBE (better from the beginning)', () => {
    const a = assessJoiningLate({ airing: { startAt: at(-27), endAt: at(33), restartAvailable: false, onDemandAvailable: false, streamingLaterAvailable: false }, program: prog({ id: 'd', title: 'Drama', genres: ['Drama', 'Thriller'] }), serialized: true, now: NOW });
    expect(a.verdict).toBe('maybe');
    expect(a.reasonKey).toBe('plot_better_start');
  });
  it('restart available → YES regardless of elapsed', () => {
    const a = assessJoiningLate({ airing: { startAt: at(-90), endAt: at(30), restartAvailable: true, onDemandAvailable: false, streamingLaterAvailable: false }, program: prog({ id: 'x', title: 'Movie', mediaType: 'movie', eventType: 'movie', genres: ['Drama'] }), serialized: false, now: NOW });
    expect(a.verdict).toBe('yes');
    expect(a.reasonKey).toBe('restart');
  });
  it('plot-dependence detection', () => {
    expect(isPlotDependent({ eventType: 'movie', genres: [], mediaType: 'movie' }, false)).toBe(true);
    expect(isPlotDependent({ eventType: 'news', genres: ['News'], mediaType: 'tv' }, false)).toBe(false);
    expect(isPlotDependent({ eventType: 'episode', genres: ['Comedy'], mediaType: 'tv' }, false)).toBe(false);
  });
});

describe('ranking — hard filters before Your Match; never overridden', () => {
  const ctx: RankContext = { now: NOW, tz: TZ, userChannelIds: new Set(['CBS']), userProviderIds: new Set(['cable-basic']) };
  const taste: TasteProfile = { id: 'me', sampleSize: 30, genreAffinity: { crime: 0.8, comedy: 0.4, romance: -0.3 }, dislikedGenres: ['horror'], favoriteNetworks: ['CBS'] };
  const items: Candidate[] = [
    { airing: air({ id: 'a1', contentId: 'crime', channelId: 'CBS', startAt: at(-10), endAt: at(50) }), program: prog({ id: 'crime', title: 'Crime Show', genres: ['Crime'], ratings: { imdb: 8 } }), channel: ch({ id: 'CBS', network: 'CBS' }) },
    { airing: air({ id: 'a2', contentId: 'romcom', channelId: 'HALL', startAt: at(-5), endAt: at(85) }), program: prog({ id: 'romcom', title: 'Romance Movie', mediaType: 'movie', eventType: 'movie', genres: ['Romance'], runtime: 90, ratings: { audience: 70 } }), channel: ch({ id: 'HALL', network: 'Hallmark' }) },
  ];
  it('a requested channel is a hard filter a high match cannot bypass', () => {
    const q: ScheduleQuery = { ...parseScheduleQuery('what is on CBS right now').query };
    const out = rankAirings(items, q, ctx, taste);
    expect(out.every((r) => r.channel.id === 'CBS')).toBe(true);
    expect(out.map((r) => r.program.id)).not.toContain('romcom');
  });
  it('maxRuntime hard-limits regardless of match', () => {
    const q: ScheduleQuery = { ...parseScheduleQuery('movies under 1 hour tonight').query, dateScope: 'now', maxRuntime: 60 };
    const out = rankAirings(items, q, ctx, taste);
    expect(out.find((r) => r.program.id === 'romcom')).toBeUndefined(); // 90min > 60
  });
  it('sorts by Your Match with favorite-network + affinity boosts', () => {
    const q: ScheduleQuery = { ...parseScheduleQuery('what is on right now').query };
    const out = rankAirings(items, q, ctx, taste);
    expect(out[0]!.program.id).toBe('crime'); // crime affinity + CBS favorite
    expect(verdictBand(out[0]!.matchScore)).toBe('stream');
  });
  it('cold-start flags general-quality', () => {
    const cold: TasteProfile = { id: 'new', sampleSize: 1, genreAffinity: {}, dislikedGenres: [], favoriteNetworks: [] };
    const m = yourMatch(prog({ id: 'x', title: 'X', genres: ['Drama'], ratings: { imdb: 8 } }), ch({ id: 'CBS' }), cold);
    expect(m.explanation.generalQuality).toBe(true);
  });
});

describe('household matching — min-weighted, dislike veto', () => {
  const chn = ch({ id: 'AMC', network: 'AMC' });
  it('is not a plain average and floors on a strong dislike', () => {
    const p = prog({ id: 'h', title: 'Horror Night', genres: ['Horror'], ratings: { imdb: 8 } });
    const a: TasteProfile = { id: 'a', sampleSize: 30, genreAffinity: { horror: 0.9 }, dislikedGenres: [], favoriteNetworks: [] };
    const b: TasteProfile = { id: 'b', sampleSize: 30, genreAffinity: {}, dislikedGenres: ['horror'], favoriteNetworks: [] };
    const r = householdScore(p, chn, [a, b]);
    expect(r.blockedBy).toContain('b');
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.label).toBe('Household Match');
  });
  it('rewards a genuine shared match above the plain mean floor', () => {
    const p = prog({ id: 'c', title: 'Crowd Pleaser', genres: ['Comedy'], ratings: { imdb: 8 } });
    const a: TasteProfile = { id: 'a', sampleSize: 30, genreAffinity: { comedy: 0.6 }, dislikedGenres: [], favoriteNetworks: [] };
    const b: TasteProfile = { id: 'b', sampleSize: 30, genreAffinity: { comedy: 0.5 }, dislikedGenres: [], favoriteNetworks: [] };
    const r = householdScore(p, chn, [a, b]);
    expect(r.score).toBeGreaterThan(60);
  });
});

describe('natural-language query parsing → structured constraints', () => {
  const P = (t: string) => parseScheduleQuery(t).query;
  it('what movies are on tonight after 8 on channels I have', () => {
    const q = P('What movies are on tonight after 8pm on channels I have?');
    expect(q.mediaTypes).toEqual(['movie']);
    expect(q.dateScope).toBe('tonight');
    expect(q.startTimeMin).toBe('20:00');
    expect(q.availabilityScope).toBe('user_channels');
    expect(q.eventTypesExclude).toContain('sports');
  });
  it('what movies start in the next two hours', () => {
    const q = P('What movies start in the next two hours?');
    expect(q.mediaTypes).toEqual(['movie']);
    expect(q.withinMinutes).toBe(120);
  });
  it('what is on CBS right now', () => {
    const q = P('What is on CBS right now?');
    expect(q.networks).toContain('CBS');
    expect(q.dateScope).toBe('now');
  });
  it('rate over 80', () => { expect(P('What is on that I would rate over 80?').minMatch).toBe(80); });
  it('two profiles tonight → household', () => { expect(P('What can two profiles watch tonight?').household.length).toBe(2); });
  it('new episodes on my channels', () => {
    const q = P('Show me new episodes on my channels.');
    expect(q.newOnly).toBe(true); expect(q.availabilityScope).toBe('user_channels'); expect(q.mediaTypes).toEqual(['tv']);
  });
  it('Hallmark movies after 8 PM', () => {
    const q = P('Show me Hallmark movies after 8 PM.');
    expect(q.networks).toContain('HALLMARK'); expect(q.startTimeMin).toBe('20:00'); expect(q.mediaTypes).toEqual(['movie']);
  });
  it('mystery under two hours tonight', () => {
    const q = P('Find a mystery under two hours tonight.');
    expect(q.maxRuntime).toBe(120); expect(q.dateScope).toBe('tonight');
  });
  it('only new episodes tonight', () => { const q = P('Show me only new episodes tonight.'); expect(q.newOnly).toBe(true); });
  it('do not show me news', () => { const q = P('Do not show me news tonight.'); expect(q.noNews).toBe(true); expect(q.eventTypesExclude).toContain('news'); });
  it('movies but no sports', () => { const q = P('Show me movies but no sports.'); expect(q.mediaTypes).toEqual(['movie']); expect(q.eventTypesExclude).toContain('sports'); });

  it('asks ONE clarification only when it materially changes results, and completes the same search', () => {
    const bare = parseScheduleQuery('Show me movies tonight.');
    expect(bare.clarification?.key).toBe('availability_scope');
    const completed = applyClarification(bare, 'mine');
    expect(completed.availabilityScope).toBe('user_channels');
    // a precise query needs no clarification
    expect(parseScheduleQuery('Show me Hallmark movies after 8 PM.').clarification).toBeNull();
  });
});
