/**
 * Phase 3 — the controlled intent matrix. These vocab tables pair a surface
 * phrasing with the ground-truth it implies, so a generated sentence and its
 * intended `NormalizedQuery` never drift apart.
 */
import type { ContentType } from '../contract';

export interface NetworkChoice {
  key: string;
  say: string[]; // surface phrasings
}
export interface PlatformChoice {
  id: number;
  name: string;
  say: string[];
}
export interface TimeChoice {
  say: string[];
  /** hours horizon, or null for non-broadcast recency phrasings. */
  horizon: number | null;
  broadcast: boolean;
}
export interface CountChoice {
  say: string;
  n: number | null; // intended count (null = "a couple/few/some" the parser can't read)
}
export interface PrefChoice {
  say: string;
  /** dimension axis + target, for soft-pref grading. */
  mood?: { key: string; target: number };
}
export interface ExclusionChoice {
  say: string;
  attr: string; // excluded attribute tag
}

export const NETWORKS: NetworkChoice[] = [
  { key: 'lifetime', say: ['Lifetime', 'on Lifetime'] },
  { key: 'hallmark', say: ['Hallmark', 'on Hallmark'] },
  { key: 'lmn', say: ['LMN', 'Lifetime Movie Network'] },
  { key: 'amc', say: ['AMC', 'on AMC'] },
  { key: 'tnt', say: ['TNT'] },
  { key: 'usa', say: ['USA', 'the USA network'] },
  { key: 'fx', say: ['FX'] },
  { key: 'hbo', say: ['HBO'] },
  { key: 'bravo', say: ['Bravo'] },
];

export const PLATFORMS: PlatformChoice[] = [
  { id: 8, name: 'Netflix', say: ['Netflix', 'on Netflix'] },
  { id: 9, name: 'Prime Video', say: ['Prime', 'Amazon Prime', 'on Prime Video'] },
  { id: 15, name: 'Hulu', say: ['Hulu', 'on Hulu'] },
  { id: 337, name: 'Disney+', say: ['Disney Plus', 'Disney+'] },
  { id: 1899, name: 'Max', say: ['Max', 'HBO Max'] },
  { id: 386, name: 'Peacock', say: ['Peacock'] },
];

export const TIMES: TimeChoice[] = [
  { say: ['right now', 'on right now'], horizon: 24, broadcast: true },
  { say: ['tonight', 'on tonight'], horizon: 6, broadcast: true },
  { say: ['later tonight'], horizon: 6, broadcast: true },
  { say: ['coming on tonight'], horizon: 6, broadcast: true },
  { say: ['in the next 3 hours', 'in the next three hours'], horizon: 3, broadcast: true },
  { say: ['in the next 24 hours', 'coming on in the next 24 hours'], horizon: 24, broadcast: true },
  { say: ['in the next couple of hours'], horizon: 3, broadcast: true },
  { say: ["what's on tv"], horizon: 24, broadcast: true },
];

export const COUNTS: CountChoice[] = [
  { say: 'one', n: 1 },
  { say: 'three', n: 3 },
  { say: 'five', n: 5 },
  { say: 'ten', n: 10 },
  { say: 'a couple of', n: 2 },
  { say: 'a few', n: 3 },
  { say: 'some', n: null },
  { say: '', n: null }, // no count
];

export const POSITIVE_PREFS: PrefChoice[] = [
  { say: 'detective mystery', mood: { key: 'complexity', target: 65 } },
  { say: 'psychological thriller', mood: { key: 'darkness', target: 70 } },
  { say: 'courtroom drama' },
  { say: 'medical drama' },
  { say: 'suspenseful', mood: { key: 'suspense', target: 75 } },
  { say: 'light mystery', mood: { key: 'darkness', target: 30 } },
  { say: 'funny but not stupid', mood: { key: 'humor', target: 65 } },
  { say: 'fast-paced', mood: { key: 'pacing', target: 85 } },
  { say: 'with a complex plot', mood: { key: 'complexity', target: 80 } },
  { say: 'with a female lead' },
  { say: 'based on a true story' },
  { say: 'with strong audience ratings' },
  { say: 'critically acclaimed' },
  { say: 'underrated' },
  { say: 'recently released' },
];

export const EXCLUSIONS: ExclusionChoice[] = [
  { say: 'nothing supernatural', attr: 'supernatural' },
  { say: 'no science fiction', attr: 'science_fiction' },
  { say: 'nothing too slow', attr: 'slow_burn' },
  { say: 'not too dark', attr: 'dark' },
  { say: 'no subtitles', attr: 'subtitles' },
  { say: 'nothing dubbed', attr: 'dubbed' },
  { say: 'no horror', attr: 'horror' },
  { say: 'no graphic violence', attr: 'graphic_violence' },
  { say: 'no romance', attr: 'romance' },
  { say: "nothing I've already watched", attr: 'already_watched' },
  { say: "don't show me anything I previously rejected", attr: 'previously_rejected' },
  { say: 'nothing longer than two hours', attr: '__runtime_capped__' },
];

export const PERSONALIZATION: { say: string; household: string | null; requested: boolean }[] = [
  { say: 'that I would like', household: null, requested: true },
  { say: "that I'd probably like", household: null, requested: true },
  { say: 'that Heather and I would both like', household: 'heather', requested: true },
  { say: 'based on what I usually watch', household: null, requested: true },
  { say: 'something my family can watch', household: 'family', requested: true },
  { say: 'that Amy would like', household: 'amy', requested: true },
  { say: '', household: null, requested: false },
];

export const UNSUPPORTED: { say: string; type: ContentType }[] = [
  { say: 'a good podcast about true crime', type: 'podcast' },
  { say: 'an audiobook for my commute', type: 'audiobook' },
  { say: 'a fantasy novel to read', type: 'book' },
  { say: 'some chill music for studying', type: 'music' },
  { say: 'a co-op video game', type: 'game' },
];
