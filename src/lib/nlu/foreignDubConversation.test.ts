import { describe, it, expect } from 'vitest';
import { applyTurn, stateToQuery, removeChip, chipsFor, EMPTY_REQUEST, type CanonicalRequest } from './conversationState';

/**
 * THE FOREIGN-DUB REGRESSION — the conversational path.
 *
 * Root cause fixed here: the production UI ALWAYS drives the conversational
 * (`applyTurn`) path, and that path used to have no field for "dubbed in English"
 * — so "three foreign movies dubbed in English" reached the finder as a generic
 * request and returned English-original titles. These tests pin the canonical
 * interpretation AND the projection onto the finder's HARD constraints, on the
 * exact path the UI uses. Assert-once-per-constraint; zero tolerance.
 */

const parse = (text: string, prev: CanonicalRequest = EMPTY_REQUEST) => applyTurn(prev, text);

describe('the exact reported query', () => {
  it('"Three movies that are foreign that are dubbed in English." → the right canonical request', () => {
    const { state } = parse('Three movies that are foreign that are dubbed in English.');
    expect(state.mediaType).toBe('movie');
    expect(state.originalLanguageClass).toBe('non_english');
    expect(state.audioRequirement).toBe('english_dub');
  });

  it('projects onto the finder as HARD non-English-original + English-dub constraints', () => {
    const { state } = parse('Three movies that are foreign that are dubbed in English.');
    const q = stateToQuery(state);
    expect(q.mediaType).toBe('movie');
    expect(q.englishDubOnly).toBe(true); // excludes native-English titles (englishAvailability must be 'available')
    expect(q.nonEnglishOriginalOnly).toBe(true); // excludes English originals outright
  });
});

describe('the international battery (§13) — every phrasing keeps the dub/foreign semantics', () => {
  const dubQueries = [
    'three movies that are foreign that are dubbed in English',
    '3 foreign films with English dubs',
    'three movies not originally in English but dubbed in English',
    'Japanese movies dubbed in English',
    'Korean thrillers with English dubbing',
    'foreign mystery dubbed into English under two hours',
  ];
  for (const text of dubQueries) {
    it(`"${text}" → english_dub + non_english`, () => {
      const { state } = parse(text);
      expect(state.audioRequirement, text).toBe('english_dub');
      expect(state.originalLanguageClass, text).toBe('non_english');
      const q = stateToQuery(state);
      expect(q.englishDubOnly, text).toBe(true);
    });
  }

  it('"non-English movies with English audio" → english_audio (native-or-dubbed) + non_english', () => {
    const { state } = parse('non-English movies with English audio');
    expect(state.audioRequirement).toBe('english_audio');
    expect(state.originalLanguageClass).toBe('non_english');
    const q = stateToQuery(state);
    expect(q.englishAudioOnly).toBe(true);
    expect(q.nonEnglishOriginalOnly).toBe(true);
  });

  it('"foreign movies, subtitles are fine" → non_english original, original audio ok (no dub filter)', () => {
    const { state } = parse('foreign movies, subtitles are fine');
    expect(state.originalLanguageClass).toBe('non_english');
    expect(state.audioRequirement).toBe('original_audio');
    const q = stateToQuery(state);
    expect(q.nonEnglishOriginalOnly).toBe(true);
    expect(q.englishDubOnly).toBeFalsy();
    expect(q.englishAudioOnly).toBeFalsy();
  });

  it('"something Korean where I don\'t have to read subtitles" → Korean original + English dub', () => {
    const { state } = parse("something Korean where I don't have to read subtitles");
    expect(state.originalLanguages).toContain('ko');
    // "don't have to read" ⇒ needs English audio; combined with a foreign original that is a dub.
    expect(['english_dub', 'english_audio']).toContain(state.audioRequirement);
    const q = stateToQuery(state);
    expect(q.originalLanguages).toContain('ko');
  });
});

describe('conversation state survives follow-ups (§6)', () => {
  it('a later "newer" turn does not drop the foreign + dub constraints', () => {
    const first = parse('three foreign mysteries dubbed in English').state;
    expect(first.audioRequirement).toBe('english_dub');
    const second = applyTurn(first, 'newer', { shownYears: [2005, 2007] }).state;
    // The relative refinement applied…
    expect(second.minYear).not.toBeNull();
    // …and the hard constraints from turn 1 are still there.
    expect(second.audioRequirement).toBe('english_dub');
    expect(second.originalLanguageClass).toBe('non_english');
    const q = stateToQuery(second);
    expect(q.englishDubOnly).toBe(true);
  });

  it('"include series too" flips media but keeps the audio/origin constraints', () => {
    const first = parse('foreign movies dubbed in English').state;
    expect(first.mediaType).toBe('movie');
    const second = applyTurn(first, 'include series too').state;
    expect(second.mediaType).toBe('any');
    expect(second.audioRequirement).toBe('english_dub');
    expect(second.originalLanguageClass).toBe('non_english');
  });
});

describe('visible interpretation + correction (§7)', () => {
  it('surfaces removable chips for the foreign + dub constraints', () => {
    const { state } = parse('three foreign movies dubbed in English');
    const ids = chipsFor(state).map((c) => c.id);
    expect(ids).toContain('origlang');
    expect(ids).toContain('audio');
  });

  it('removing the audio chip clears just the dub requirement', () => {
    const state = parse('foreign movies dubbed in English').state;
    const cleared = removeChip(state, 'audio');
    expect(cleared.audioRequirement).toBe('any');
    expect(cleared.originalLanguageClass).toBe('non_english'); // foreign kept
    expect(stateToQuery(cleared).englishDubOnly).toBeFalsy();
  });

  it('removing the origin-language chip clears the foreign requirement', () => {
    const state = parse('foreign movies dubbed in English').state;
    const cleared = removeChip(state, 'origlang');
    expect(cleared.originalLanguageClass).toBe('any');
    expect(stateToQuery(cleared).nonEnglishOriginalOnly).toBeFalsy();
  });
});

describe('clarification only when it matters (§8)', () => {
  it('"an English foreign movie" is ambiguous → one concise clarification', () => {
    const { clarify } = parse('find me an English foreign movie');
    expect(clarify).toBeTruthy();
    expect(clarify!.toLowerCase()).toContain('dub');
  });

  it('"foreign movie dubbed in English" is NOT ambiguous → no clarification', () => {
    const { clarify } = parse('foreign movie dubbed in English');
    expect(clarify).toBeNull();
  });
});
