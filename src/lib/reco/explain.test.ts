import { describe, it, expect } from 'vitest';
import { explainTitle, unsupportedClaimCount } from './explain';
import { parseIntent } from './parseIntent';
import { FixtureEmbeddingProvider } from './embedding';
import type { SynthTitle } from './synthCatalog';

const emb = new FixtureEmbeddingProvider('explain');
const title = (over: Partial<SynthTitle> & { id: string }): SynthTitle => ({
  mediaType: 'movie', title: over.id, alternateTitles: [], releaseYear: 2010,
  runtimeMinutes: 100, originalLanguage: 'en', contentRating: 'PG-13',
  genres: ['drama'], subgenres: [], keywords: [], director: 'd', leadPerformers: [],
  cast: [], franchise: null, sequenceOrder: null, remakeOf: null, sequelOf: null,
  synopsis: '', features: {}, criticScore: 7, audienceScore: 7, popularity: 1,
  voteCount: 10, metadataConfidence: 0.9, availability: [],
  vector: emb.vectorFor(over.id), tags: ['normal'], ...over,
});

describe('grounded explanations', () => {
  it('every asserted claim names the field and value it came from', () => {
    const req = parseIntent('a drama under two hours');
    const e = explainTitle(title({ id: 'a', genres: ['drama'], runtimeMinutes: 95 }), req);
    expect(e.evidence.length).toBeGreaterThan(0);
    for (const ev of e.evidence.filter((x) => x.supported)) {
      expect(ev.sourceField, `"${ev.claim}" has no source`).not.toBe('');
      expect(ev.value, `"${ev.claim}" has no value`).not.toBe('');
    }
    expect(unsupportedClaimCount(e)).toBe(0);
  });

  it('produces NO claim for an unknown trait — it records a gap instead', () => {
    const req = parseIntent('a thriller but nothing gory');
    const e = explainTitle(title({ id: 'u', features: {} }), req);
    expect(e.evidence.some((x) => x.sourceField.includes('gore'))).toBe(false);
    expect(e.gaps.join(' ')).toMatch(/limited data/i);
    // And the sentence must not silently imply it is not gory.
    expect(e.sentence).not.toMatch(/restrained about gore/);
  });

  it('never asserts availability from a stale check', () => {
    const stale = title({
      id: 's',
      availability: [{ provider: 'netflix', monetization: 'flatrate', region: 'US', verifiedDaysAgo: 40, confidence: 0.3 }],
    });
    const e = explainTitle(stale, parseIntent('anything'));
    const avail = e.evidence.find((x) => x.sourceField.startsWith('title_availability'));
    expect(avail?.supported).toBe(false);
    expect(avail?.claim).toMatch(/should be confirmed/);
    expect(e.sentence).not.toMatch(/is on netflix/i);
  });

  it('asserts availability plainly when the check is fresh', () => {
    const fresh = title({
      id: 'f',
      availability: [{ provider: 'netflix', monetization: 'flatrate', region: 'US', verifiedDaysAgo: 2, confidence: 0.95 }],
    });
    const e = explainTitle(fresh, parseIntent('anything'));
    expect(e.sentence).toMatch(/is on netflix/i);
  });

  it('hedges the wording when metadata confidence is low, without dropping the claim', () => {
    const req = parseIntent('something with more dialogue');
    const sure = explainTitle(title({ id: 'a', features: { dialogueDensity: 0.9 }, metadataConfidence: 0.95 }), req);
    const unsure = explainTitle(title({ id: 'b', features: { dialogueDensity: 0.9 }, metadataConfidence: 0.4 }), req);
    expect(sure.sentence).toMatch(/dialogue-forward/);
    expect(unsure.sentence).toMatch(/may be dialogue-forward/);
  });

  it('says so honestly when it knows nothing at all', () => {
    const e = explainTitle(title({ id: 'blank', genres: [] }), parseIntent(''));
    expect(e.sentence).toMatch(/not have enough verified data/i);
  });

  it('reports a weaker member rather than hiding it behind the mean', () => {
    const e = explainTitle(title({ id: 'a' }), parseIntent('a drama'), {
      id: 'a', memberScores: { x: 0.9, y: 0.2 }, groupMean: 0.55, lowestMemberScore: 0.2,
      disagreement: 0.7, compromiseScore: 0.4, semanticScore: 0.5, watchDnaScore: 0.5,
      tonightScore: 0.5, availabilityConfidence: 0.5, metadataConfidence: 0.9,
      finalPreDiversityScore: 0.4, severeMismatchFor: ['y'], gatedOut: false,
      gateReason: null, method: 'min_protected', rankingVersion: 't',
    });
    expect(e.sentence).toMatch(/one person is a weaker fit/i);
  });
});
