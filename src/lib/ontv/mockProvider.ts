/**
 * MockScheduleProvider — deterministic, offline. Powers unit tests and the dev
 * dashboard without a live EPG. Data is generated RELATIVE to `now` so "on now" /
 * "starting soon" always have content. Includes one sports item (to prove it is
 * filtered out), items with missing artwork/ratings (to prove clean omission), and
 * a serialized drama + a standalone procedural (for Worth Joining Late).
 */
import 'server-only';
import type { Airing, Channel, Program } from './types';
import { eventTypeFromRaw } from './sports';
import type { ScheduleProvider, AiringBundle, UpcomingOpts } from './provider';
import { freshness } from './provider';

const CH = (id: string, network: string, callSign: string, number: string, fav = false): Channel => ({
  id, name: network, callSign, logo: null, network, channelNumber: number, region: 'US', providerIds: ['ota', 'cable-basic'], isFavorite: fav, isHidden: false,
});

const CHANNELS: Channel[] = [
  CH('CBS', 'CBS', 'CBS', '2', true),
  CH('NBC', 'NBC', 'NBC', '4'),
  CH('AMC', 'AMC', 'AMC', '54', true),
  CH('HALL', 'Hallmark', 'HALL', '60'),
  CH('PBS', 'PBS', 'PBS', '13'),
  CH('FX', 'FX', 'FX', '48'),
  CH('ESPN', 'ESPN', 'ESPN', '32'), // sports — must be filtered
];

interface Spec { id: string; title: string; ch: string; type: string; genres: string[]; runtime: number; offsetMin: number; new?: boolean; repeat?: boolean; serialized?: boolean; restart?: boolean; onDemand?: boolean; ratings?: Program['ratings']; artwork?: string | null; ep?: { s: number; n: number; title: string }; rating?: string; country?: string[]; origLang?: string; audio?: string[]; subs?: string[] }

const SPECS: Spec[] = [
  { id: 'show:castle', title: 'Castle', ch: 'CBS', type: 'Scripted', genres: ['Comedy', 'Crime'], runtime: 60, offsetMin: -18, serialized: false, restart: false, onDemand: true, ratings: { imdb: 8.1, rt: 84, audience: 88 }, ep: { s: 3, n: 7, title: 'Almost Famous' }, rating: 'TV-14' },
  { id: 'movie:thriller', title: 'The Vanishing at Cedar Hollow — A Mystery', ch: 'AMC', type: 'Movie', genres: ['Thriller', 'Mystery'], runtime: 118, offsetMin: -54, restart: false, onDemand: true, ratings: { imdb: 7.2 }, rating: 'PG-13' },
  { id: 'show:sitcom', title: 'Laugh Track', ch: 'NBC', type: 'Scripted', genres: ['Comedy'], runtime: 30, offsetMin: -9, repeat: true, ratings: { imdb: 6.8 }, ep: { s: 5, n: 12, title: 'The Reunion' } },
  { id: 'show:drama', title: 'The Long Winter', ch: 'FX', type: 'Scripted', genres: ['Drama', 'Thriller'], runtime: 60, offsetMin: -27, serialized: true, new: true, ratings: { imdb: 8.6, rt: 93 }, ep: { s: 2, n: 4, title: 'Fracture' }, rating: 'TV-MA' },
  { id: 'movie:hallmark', title: 'A Snowfall to Remember', ch: 'HALL', type: 'Movie', genres: ['Romance', 'Family'], runtime: 90, offsetMin: 22, ratings: { audience: 72 }, rating: 'TV-G' },
  { id: 'movie:doc', title: 'Deep Ocean', ch: 'PBS', type: 'Documentary', genres: ['Documentary'], runtime: 55, offsetMin: 45, artwork: null, rating: 'TV-PG' },
  { id: 'show:new1', title: 'Precinct 9', ch: 'CBS', type: 'Scripted', genres: ['Crime', 'Drama'], runtime: 60, offsetMin: 60, new: true, ratings: { imdb: 7.9 }, ep: { s: 1, n: 3, title: 'Cold Open' }, rating: 'TV-14' },
  { id: 'movie:late', title: 'Midnight Run Redux', ch: 'AMC', type: 'Movie', genres: ['Action', 'Comedy'], runtime: 110, offsetMin: 200, ratings: { imdb: 7.0 }, rating: 'R' },
  // International productions — foreign original language WITH a verified English dub
  // (included) and one subtitle-only (excluded when English audio is required).
  { id: 'show:dk', title: 'The Bridge (Broen)', ch: 'FX', type: 'Scripted', genres: ['Crime', 'Thriller'], runtime: 60, offsetMin: 30, new: true, serialized: true, ratings: { imdb: 8.6 }, ep: { s: 4, n: 2, title: 'Crossing' }, rating: 'TV-MA', country: ['Denmark', 'Sweden'], origLang: 'Danish', audio: ['Danish', 'English'], subs: ['English'] },
  { id: 'show:es', title: 'Gran Hotel', ch: 'HALL', type: 'Scripted', genres: ['Drama', 'Mystery'], runtime: 60, offsetMin: 80, ratings: { imdb: 8.2 }, ep: { s: 1, n: 5, title: 'La Carta' }, rating: 'TV-14', country: ['Spain'], origLang: 'Spanish', audio: ['Spanish', 'English'], subs: ['English'] },
  { id: 'show:fr', title: 'Spiral (Engrenages)', ch: 'PBS', type: 'Scripted', genres: ['Crime', 'Drama'], runtime: 60, offsetMin: 130, ratings: { imdb: 8.4 }, ep: { s: 6, n: 1, title: 'Nouvelle Affaire' }, rating: 'TV-MA', country: ['France'], origLang: 'French', audio: ['French'], subs: ['English'] }, // subtitle-only → excluded under English-audio
  { id: 'sport:game', title: 'Monday Night Matchup', ch: 'ESPN', type: 'Sports', genres: ['Sports'], runtime: 180, offsetMin: -30 }, // filtered everywhere
];

function build(now: number): { airings: Airing[]; programs: Record<string, Program>; channels: Record<string, Channel> } {
  const airings: Airing[] = [];
  const programs: Record<string, Program> = {};
  const channels: Record<string, Channel> = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));
  for (const s of SPECS) {
    const start = now + s.offsetMin * 60000;
    const end = start + s.runtime * 60000;
    const mediaType = s.type.toLowerCase().includes('movie') ? 'movie' : 'tv';
    programs[s.id] = {
      id: s.id, title: s.title, episodeTitle: s.ep?.title ?? null, mediaType, eventType: eventTypeFromRaw(s.type, s.genres),
      seasonNumber: s.ep?.s ?? null, episodeNumber: s.ep?.n ?? null, genres: s.genres,
      synopsis: `${s.title} — a ${s.genres.join('/').toLowerCase()} ${mediaType}.`,
      artwork: s.artwork === undefined ? `https://image.example/${s.id}.jpg` : s.artwork,
      ratings: s.ratings ?? null, cast: [], runtime: s.runtime, contentWarnings: [], contentRating: s.rating ?? null,
      countryOfOrigin: s.country ?? ['USA'], originalLanguage: s.origLang ?? 'English',
      availableAudioLanguages: s.audio ?? ['English'], availableSubtitleLanguages: s.subs ?? [],
    };
    airings.push({
      id: `${s.ch}:${s.id}:${start}`, contentId: s.id, channelId: s.ch,
      startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(),
      isLive: mediaType === 'tv', isNew: !!s.new, isRepeat: !!s.repeat,
      restartAvailable: !!s.restart, onDemandAvailable: !!s.onDemand, streamingLaterAvailable: !!s.onDemand,
      sourceUpdatedAt: new Date(now - 4 * 60000).toISOString(),
    });
  }
  return { airings, programs, channels };
}

export class MockScheduleProvider implements ScheduleProvider {
  readonly name = 'mock';
  async getChannels(): Promise<Channel[]> { return CHANNELS; }
  private bundle(opts: UpcomingOpts): AiringBundle {
    const b = build(opts.now);
    return { ...b, freshness: freshness(opts.now, opts.now - 4 * 60000, opts.horizonMs) };
  }
  async getAirings(opts: UpcomingOpts): Promise<AiringBundle> { return this.bundle(opts); }
  async getCurrentAirings(now: number): Promise<AiringBundle> { return this.bundle({ now, horizonMs: 3_600_000 }); }
  async getUpcomingAirings(opts: UpcomingOpts): Promise<AiringBundle> { return this.bundle(opts); }
  async searchAirings(_text: string, opts: UpcomingOpts): Promise<AiringBundle> { return this.bundle(opts); }
  async getAiringsForProgram(contentId: string, opts: UpcomingOpts): Promise<AiringBundle> {
    const b = this.bundle(opts);
    b.airings = b.airings.filter((a) => a.contentId === contentId);
    return b;
  }
}
