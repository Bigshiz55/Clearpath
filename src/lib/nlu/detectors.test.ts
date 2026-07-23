import { describe, it, expect } from 'vitest';
import {
  detectAiringHorizon,
  detectTemporalHorizon,
  extractWatchTitle,
  normalizeTitleAlias,
  detectGenre,
  detectNetwork,
  detectPlatform,
  extractCount,
  parseRequestedCount,
} from './detectors';

// Characterization tests: these freeze the *current* production behaviour of
// the intent detectors after their behaviour-preserving extraction out of
// src/app/api/build-case/route.ts. If the evaluation framework later proposes a
// fix, the fix must update the specific expectation here on purpose — never
// silently. Several assertions below deliberately encode a *known bug* (marked
// KNOWN-BUG) so a fix flips them intentionally.

describe('detectAiringHorizon', () => {
  it('reads explicit digit hour windows, clamped 1..48', () => {
    expect(detectAiringHorizon('in the next 3 hours')).toBe(3);
    expect(detectAiringHorizon('coming up in 24 hours')).toBe(24);
    expect(detectAiringHorizon('within 99 hours')).toBe(48); // clamp
  });
  it('reads spelled-out hour windows', () => {
    expect(detectAiringHorizon('the next four hours')).toBe(4);
    expect(detectAiringHorizon('next a couple of hours')).toBe(3);
    expect(detectAiringHorizon('next few hours')).toBe(4);
  });
  it('maps airing cues without a number', () => {
    expect(detectAiringHorizon("what's on tv tonight")).toBe(6);
    expect(detectAiringHorizon("what's on tv")).toBe(24);
    expect(detectAiringHorizon('coming on later')).toBe(24);
  });
  it('KNOWN-BUG: "tonight" alone (no airing cue) does not route to the guide', () => {
    expect(detectAiringHorizon('a good movie tonight')).toBeNull();
  });
  it('KNOWN-BUG: no clock-time parsing', () => {
    expect(detectAiringHorizon("what's on at 8pm")).toBe(24); // matches "what's on", ignores 8pm
    expect(detectAiringHorizon('anything good after 8')).toBeNull();
  });
});

describe('count parsing', () => {
  it('reads explicit numbers and words', () => {
    expect(extractCount('give me five movies')).toBe(5);
    expect(extractCount('show me 3 shows')).toBe(3);
    expect(extractCount('a good movie')).toBeNull();
    expect(parseRequestedCount('a good movie')).toBe(8); // default
  });
  it('reads fuzzy spoken counts "a couple"/"a few"', () => {
    expect(extractCount('a couple of movies on Netflix')).toBe(2);
    expect(extractCount('show me a few thrillers')).toBe(3);
    expect(parseRequestedCount('a couple of movies')).toBe(2);
  });
});

describe('detectTemporalHorizon (liberal — used only alongside a named network)', () => {
  it('reads bare temporal cues that detectAiringHorizon deliberately ignores', () => {
    // These return null from the conservative detector...
    expect(detectAiringHorizon('AMC movies later tonight')).toBeNull();
    expect(detectAiringHorizon('Hallmark mysteries tomorrow')).toBeNull();
    // ...but the liberal reader recognizes them (the caller gates on a network).
    expect(detectTemporalHorizon('AMC movies later tonight')).toBe(6);
    expect(detectTemporalHorizon('a movie tonight')).toBe(6);
    expect(detectTemporalHorizon('Hallmark mysteries tomorrow')).toBe(24);
    expect(detectTemporalHorizon('something tomorrow night')).toBe(24);
    expect(detectTemporalHorizon('a movie right now')).toBe(3);
    expect(detectTemporalHorizon('a movie this weekend')).toBe(48);
  });
  it('reads clock times as the rest of the evening', () => {
    expect(detectTemporalHorizon('after 8 tonight')).toBe(6);
    expect(detectTemporalHorizon('at 9pm')).toBe(6);
  });
  it('defers to the conservative detector for explicit windows', () => {
    expect(detectTemporalHorizon('in the next 3 hours')).toBe(3);
  });
  it('returns null when no temporal cue at all', () => {
    expect(detectTemporalHorizon('a good crime thriller')).toBeNull();
  });
});

describe('extractWatchTitle', () => {
  it('pulls a title from where-to-watch phrasings', () => {
    expect(extractWatchTitle('where can I watch Oppenheimer')).toBe('Oppenheimer');
    expect(extractWatchTitle('is Barbie on Max')).toBe('Barbie');
    expect(extractWatchTitle("where's Dune streaming")).toBe('Dune');
  });
  it('returns null for a platform browse (not a title)', () => {
    expect(extractWatchTitle('is there anything good on Netflix')).toBeNull();
    expect(extractWatchTitle('what should I watch tonight')).toBeNull();
  });
  it('KNOWN-BUG: drops legit titles beginning with a stopword', () => {
    expect(extractWatchTitle('where can I watch It')).toBeNull(); // "it" stopword
    expect(extractWatchTitle('where can I stream A Quiet Place')).toBeNull(); // "a" stopword
  });
  it('KNOWN-BUG: truncates titles containing " on "', () => {
    expect(extractWatchTitle('where can I watch Cars on the Road')).toBe('Cars');
  });
});

describe('normalizeTitleAlias', () => {
  it('expands known shorthand', () => {
    expect(normalizeTitleAlias('GOT')).toBe('Game of Thrones');
    expect(normalizeTitleAlias('the office us')).toBe('The Office');
  });
  it('passes through unknown titles', () => {
    expect(normalizeTitleAlias('Oppenheimer')).toBe('Oppenheimer');
  });
});

describe('detectGenre', () => {
  it('maps a named genre to its TVmaze tag', () => {
    expect(detectGenre('funny movies')).toBe('Comedy');
    expect(detectGenre('a good thriller')).toBe('Thriller');
    expect(detectGenre('scary movie')).toBe('Horror');
  });
  it('KNOWN-BUG: first-match-wins drops secondary genres', () => {
    expect(detectGenre('crime thriller')).toBe('Crime'); // Thriller lost
  });
});

describe('detectNetwork', () => {
  it('recognizes cable networks, specific-before-general', () => {
    expect(detectNetwork('Lifetime movies')).toEqual({ key: 'lifetime', name: 'Lifetime' });
    expect(detectNetwork('on Hallmark')).toEqual({ key: 'hallmark', name: 'Hallmark' });
    expect(detectNetwork('LMN thriller')).toEqual({ key: 'lmn', name: 'LMN (Lifetime Movies)' });
    expect(detectNetwork('Fox News')).toEqual({ key: 'fox news', name: 'Fox News' });
  });
  it('returns null when no network named', () => {
    expect(detectNetwork('a good movie')).toBeNull();
  });
});

describe('detectPlatform', () => {
  it('matches strong aliases anywhere', () => {
    expect(detectPlatform('best on Netflix')).toEqual({ id: 8, name: 'Netflix' });
    expect(detectPlatform('Hulu shows')).toEqual({ id: 15, name: 'Hulu' });
  });
  it('matches bare aliases only after "on"', () => {
    expect(detectPlatform('on amazon')).toEqual({ id: 9, name: 'Prime Video' });
    expect(detectPlatform('an amazon warehouse documentary')).toBeNull(); // bare, not after "on"
  });
  it('KNOWN-BUG: hbo maps to Max streaming id, not the HBO linear channel', () => {
    expect(detectPlatform('on HBO')).toEqual({ id: 1899, name: 'Max' });
  });
  it('honours a self-correction — prefers the platform named after the cue', () => {
    expect(detectPlatform('movies on Netflix, actually make that Prime')).toEqual({ id: 9, name: 'Prime Video' });
    expect(detectPlatform('on Netflix, no wait, Hulu')).toEqual({ id: 15, name: 'Hulu' });
    // No correction cue → first platform still wins.
    expect(detectPlatform('best movies on Netflix')).toEqual({ id: 8, name: 'Netflix' });
  });
});
