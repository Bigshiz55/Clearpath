import { describe, it, expect } from 'vitest';
import {
  CanonicalDiscoveryRequestSchema,
  ORIGINAL_LANGUAGE_CLASSES,
  AUDIO_REQUIREMENTS,
  type CanonicalDiscoveryRequest,
} from './schemas';
import { canonicalToQuery } from './canonicalToQuery';
import {
  ORIGINAL_LANGUAGE_CLASSES as CONV_LANG,
  AUDIO_REQUIREMENTS as CONV_AUDIO,
} from '@/lib/nlu/conversationState';

/**
 * ONE SHARED CANONICAL VOCABULARY across both brains.
 *
 * The AI interpreter and the deterministic conversational parser must mean the
 * SAME thing by "foreign" and "dubbed in English", and both must project to the
 * SAME finder HARD constraints. These tests pin that the AI canonical schema now
 * carries the audio/origin fields and that `canonicalToQuery` maps them exactly
 * as the conversational `stateToQuery` does — closing the schema gap that let
 * "three foreign movies dubbed in English" fall through on the AI path.
 */

function req(over: Partial<CanonicalDiscoveryRequest['hardConstraints']>): CanonicalDiscoveryRequest {
  return CanonicalDiscoveryRequestSchema.parse({
    intent: 'discover',
    mediaTypes: ['movie'],
    interpretationSummary: 'test',
    hardConstraints: over,
  });
}

describe('shared vocabulary parity with the deterministic path', () => {
  it('the AI schema uses the exact same class + audio vocabularies as conversationState', () => {
    expect([...ORIGINAL_LANGUAGE_CLASSES]).toEqual([...CONV_LANG]);
    expect([...AUDIO_REQUIREMENTS]).toEqual([...CONV_AUDIO]);
  });
});

describe('CanonicalDiscoveryRequest carries + verifies the audio/origin intent', () => {
  it('"three foreign movies dubbed in English" → the finder HARD constraints', () => {
    const r = req({ originalLanguageClass: 'non_english', audioRequirement: 'english_dub', resultCountMax: 3 });
    const { query } = canonicalToQuery(r);
    expect(query.mediaType).toBe('movie');
    expect(query.englishDubOnly).toBe(true); // non-English original WITH a verified English track
    expect(query.nonEnglishOriginalOnly).toBe(true); // never a native-English title
    expect(query.finalCount).toBe(3); // exact count, no padding
  });

  it('english_audio maps to englishAudioOnly (native or dubbed)', () => {
    const { query } = canonicalToQuery(req({ originalLanguageClass: 'non_english', audioRequirement: 'english_audio' }));
    expect(query.englishAudioOnly).toBe(true);
    expect(query.nonEnglishOriginalOnly).toBe(true);
    expect(query.englishDubOnly).toBeUndefined();
  });

  it('a named original language projects through, and foreign is implied', () => {
    const { query } = canonicalToQuery(req({ originalLanguageClass: 'non_english', originalLanguages: ['ko'], audioRequirement: 'english_dub' }));
    expect(query.originalLanguages).toEqual(['ko']);
    expect(query.englishDubOnly).toBe(true);
  });

  it('original_audio (subtitles fine) does NOT force an English track', () => {
    const { query } = canonicalToQuery(req({ originalLanguageClass: 'non_english', audioRequirement: 'original_audio' }));
    expect(query.nonEnglishOriginalOnly).toBe(true);
    expect(query.englishDubOnly).toBeUndefined();
    expect(query.englishAudioOnly).toBe(false);
  });

  it('an empty request imposes no audio/origin constraint', () => {
    const { query } = canonicalToQuery(req({}));
    expect(query.englishDubOnly).toBeUndefined();
    expect(query.nonEnglishOriginalOnly).toBeUndefined();
    expect(query.englishAudioOnly).toBe(false);
  });

  it('the schema rejects an unknown audio requirement (strict trust boundary)', () => {
    const bad = CanonicalDiscoveryRequestSchema.safeParse({
      intent: 'discover',
      interpretationSummary: 'x',
      hardConstraints: { audioRequirement: 'english_subtitles' },
    });
    expect(bad.success).toBe(false);
  });
});
