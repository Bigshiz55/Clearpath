import { describe, it, expect } from 'vitest';
import { computeGeneralScore } from '@/lib/scoring/general';
import { SCENARIOS, scenarioById } from './evidenceFixtures';
import {
  buildEvidence, evidenceStrength, MEANINGFUL_VOTES, type EvidenceInput,
} from './evidence';
import type { TitleMetadata } from '@/lib/types';

/**
 * These run the REAL scoring engine over each fixture, so the evidence summary
 * is tested against numbers the product would actually produce — not against a
 * hand-written source array that could drift from `scoring/general.ts`.
 */
function evidenceFor(meta: TitleMetadata, providers = null) {
  const general = computeGeneralScore(meta, providers);
  const input: EvidenceInput = {
    sources: general.sources,
    breakdown: general.breakdown,
    voteCount: meta.voteCount,
    hasAudienceRating: meta.voteAverage != null && meta.voteCount > 0,
    hasPopularity: meta.popularity != null && meta.popularity > 0,
    hasProviders: providers != null,
    mediaType: meta.mediaType,
  };
  return { general, evidence: buildEvidence(input) };
}

const forScenario = (id: string) => evidenceFor(scenarioById(id)!.meta);

describe('source classification', () => {
  it('counts only the sources the engine actually blended', () => {
    // D has every counted source AND four display-only community feeds.
    const { evidence } = forScenario('D');
    expect(evidence.counted.map((s) => s.name).sort()).toEqual(
      ['IMDb', 'Metacritic', 'RT Audience', 'Rotten Tomatoes', 'TMDB Audience'],
    );
    // Present, but never blended — they must not be described as counted.
    expect(evidence.contextOnly.map((s) => s.name).sort()).toEqual(
      ['Letterboxd', 'Metacritic Users', 'Roger Ebert', 'Trakt'],
    );
    for (const s of evidence.contextOnly) {
      expect(s.counted).toBe(false);
      expect(s.weight).toBeNull();
      expect(s.note).toMatch(/not counted/i);
    }
    expect(evidence.unavailable).toHaveLength(0);
  });

  it('orders counted sources by how much they actually moved the number', () => {
    const { evidence } = forScenario('D');
    const weights = evidence.counted.map((s) => s.weight!);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    // And the shares are real shares of one blend.
    const total = weights.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
  });

  it('describes an unavailable source as absent, never as a low score', () => {
    const { evidence } = forScenario('A');
    expect(evidence.counted.map((s) => s.name)).toEqual(['TMDB Audience']);
    expect(evidence.unavailable).toHaveLength(8);
    for (const s of evidence.unavailable) {
      expect(s.raw).toBeNull();
      expect(s.counted).toBe(false);
      expect(s.note).toMatch(/not counted/i);
      // Stated explicitly, because "absent" and "bad" are the two readings a
      // user could take from a blank, and only one of them is true.
      expect(s.note).toMatch(/not treated as a low score/i);
    }
  });
});

describe('unavailable sources never affect the score', () => {
  it('adding an unavailable-in-both-cases provider changes nothing', () => {
    const base = scenarioById('A')!.meta;
    // Explicit nulls are what "unavailable" means on the wire.
    const withNulls: TitleMetadata = {
      ...base,
      imdbRating: null, rottenTomatoes: null, rtAudience: null, metascore: null,
      metacriticUser: null, trakt: null, letterboxd: null, rogerEbert: null,
    };
    expect(computeGeneralScore(withNulls, null).score).toBe(computeGeneralScore(base, null).score);
  });

  it('the blended quality number is identical whether or not display-only feeds are present', () => {
    const base = scenarioById('A')!.meta;
    const withCommunity: TitleMetadata = {
      ...base, metacriticUser: 9.9, trakt: 99, letterboxd: 5, rogerEbert: 4,
    };
    // Community feeds are display-only: they must not touch the score at all.
    expect(computeGeneralScore(withCommunity, null).score).toBe(computeGeneralScore(base, null).score);
    expect(computeGeneralScore(withCommunity, null).breakdown.quality)
      .toBe(computeGeneralScore(base, null).breakdown.quality);
  });

  it('a counted source that IS present does move the number — proving the check above has teeth', () => {
    const base = scenarioById('A')!.meta;
    const withImdb: TitleMetadata = { ...base, imdbRating: 4.0 };
    expect(computeGeneralScore(withImdb, null).breakdown.quality)
      .not.toBe(computeGeneralScore(base, null).breakdown.quality);
  });
});

describe('evidence strength is deterministic', () => {
  it('is a pure function of counted-source count and vote volume', () => {
    expect(evidenceStrength(0, 0)).toBe('limited');
    expect(evidenceStrength(0, 999_999)).toBe('limited');
    expect(evidenceStrength(1, 0)).toBe('moderate'); // editorial aggregate, no volume reported
    expect(evidenceStrength(1, 1)).toBe('limited');
    expect(evidenceStrength(1, MEANINGFUL_VOTES - 1)).toBe('limited');
    expect(evidenceStrength(1, MEANINGFUL_VOTES)).toBe('moderate');
    expect(evidenceStrength(2, 0)).toBe('moderate');
    expect(evidenceStrength(2, MEANINGFUL_VOTES)).toBe('strong');
    expect(evidenceStrength(3, 0)).toBe('strong');
  });

  it('returns the same label for the same input every time', () => {
    for (const s of SCENARIOS) {
      const runs = Array.from({ length: 5 }, () => evidenceFor(s.meta).evidence.strength);
      expect(new Set(runs).size, s.id).toBe(1);
    }
  });

  it('labels each documented data condition as expected', () => {
    const expected: Record<string, string> = {
      A: 'moderate',  // one source, 443 votes
      B: 'strong',    // two sources, 5.1k votes
      C: 'moderate',  // two RT feeds, but no vote volume reported anywhere
      D: 'strong',    // five counted sources
      E: 'limited',
      F: 'limited',   // one source, 7 votes
      G: 'moderate',  // one source, huge volume — volume alone is not breadth
      H: 'strong',    // TMDB + RT audience, 41k votes
      I: 'moderate',  // RT critics + Metacritic, no volume to corroborate
      J: 'strong',    // TMDB + IMDb, 1.3k votes
    };
    for (const [id, want] of Object.entries(expected)) {
      expect(forScenario(id).evidence.strength, `${id}`).toBe(want);
    }
  });
});

describe('the score is qualified when evidence is thin', () => {
  it('says "Early prediction" when nothing at all was available', () => {
    const { evidence } = forScenario('E');
    expect(evidence.counted).toHaveLength(0);
    expect(evidence.qualifier).toBe('Early prediction');
    expect(evidence.headline).toMatch(/no external rating source/i);
  });

  it('says "Limited-source prediction" on a single thin source', () => {
    expect(forScenario('F').evidence.qualifier).toBe('Limited-source prediction');
  });

  it('does not qualify a well-evidenced score', () => {
    expect(forScenario('D').evidence.qualifier).toBeNull();
    expect(forScenario('B').evidence.qualifier).toBeNull();
  });
});

describe('derived factors state their real basis', () => {
  it('every factor carries a non-empty basis', () => {
    for (const s of SCENARIOS) {
      const { evidence } = evidenceFor(s.meta);
      expect(evidence.factors).toHaveLength(4);
      for (const f of evidence.factors) {
        expect(f.basis.length, `${s.id}/${f.key}`).toBeGreaterThan(20);
      }
    }
  });

  it('names the actual contributing sources in the quality basis', () => {
    const { evidence } = forScenario('B');
    const quality = evidence.factors.find((f) => f.key === 'quality')!;
    expect(quality.basis).toContain('IMDb');
    expect(quality.basis).toContain('TMDB Audience');
    expect(quality.neutralBaseline).toBe(false);
  });

  it('does not describe a single source as a blend', () => {
    // The live page hit this: one source read "Blended from TMDB Audience,
    // each weighted by…", which claims a mixing that did not happen.
    const quality = forScenario('A').evidence.factors.find((f) => f.key === 'quality')!;
    expect(quality.basis).not.toMatch(/blended from|each weighted/i);
    expect(quality.basis).toContain('the only rating source available');
    expect(quality.basis).toContain('Nothing was blended with it');
    // The multi-source wording is still used where it is true.
    const multi = forScenario('B').evidence.factors.find((f) => f.key === 'quality')!;
    expect(multi.basis).toMatch(/Blended from/);
  });

  it('marks a neutral baseline as a baseline, not as a measurement', () => {
    // I: critics available, no audience rating at all.
    const { evidence } = forScenario('I');
    const audience = evidence.factors.find((f) => f.key === 'audience')!;
    expect(audience.neutralBaseline).toBe(true);
    expect(audience.basis).toMatch(/neutral baseline/i);
    expect(audience.basis).toMatch(/nothing was inferred/i);

    // …and the counterpart is NOT marked when the data exists.
    const withAudience = forScenario('B').evidence.factors.find((f) => f.key === 'audience')!;
    expect(withAudience.neutralBaseline).toBe(false);
    expect(withAudience.basis).toMatch(/vote/i);
  });

  it('never implies a critic score was reconstructed when critics are missing', () => {
    // H: strong audience, no critic aggregator.
    const { evidence } = forScenario('H');
    const blob = JSON.stringify(evidence).toLowerCase();
    expect(blob).not.toMatch(/estimated critic|inferred critic|reconstruct|approximate critic/);
    expect(evidence.counted.map((s) => s.name)).not.toContain('Rotten Tomatoes');
    expect(evidence.counted.map((s) => s.name)).not.toContain('Metacritic');
  });

  it('reports the neutral baseline for engagement when popularity is missing', () => {
    const { evidence } = forScenario('E');
    const engagement = evidence.factors.find((f) => f.key === 'engagement')!;
    expect(engagement.neutralBaseline).toBe(true);
    expect(engagement.basis).toMatch(/neutral baseline/i);
  });
});

describe('the summary never lets absence dominate', () => {
  it('the headline names only real evidence', () => {
    const { evidence } = forScenario('A');
    expect(evidence.headline).toBe('Based on TMDB Audience.');
    expect(evidence.headline).not.toMatch(/not available/i);
  });

  it('missing sources are summarised in one line, not enumerated', () => {
    const { evidence } = forScenario('A');
    expect(evidence.unavailableNote).toBe(
      '8 other rating sources were unavailable and were not counted.',
    );
  });

  it('says nothing about absence when everything is present', () => {
    expect(forScenario('D').evidence.unavailableNote).toBeNull();
  });

  it('formats very large vote counts readably', () => {
    const { evidence } = forScenario('G');
    const audience = evidence.factors.find((f) => f.key === 'audience')!;
    expect(audience.basis).toContain('2,847,193');
  });
});

describe('every scenario produces a coherent summary', () => {
  it('classifies all nine sources exactly once, with no overlap', () => {
    for (const s of SCENARIOS) {
      const { general, evidence } = evidenceFor(s.meta);
      const total = evidence.counted.length + evidence.contextOnly.length + evidence.unavailable.length;
      expect(total, s.id).toBe(general.sources.length);
      const names = [
        ...evidence.counted, ...evidence.contextOnly, ...evidence.unavailable,
      ].map((x) => x.name);
      expect(new Set(names).size, s.id).toBe(names.length);
    }
  });

  it('never reports a counted source without a displayable value', () => {
    for (const s of SCENARIOS) {
      for (const c of evidenceFor(s.meta).evidence.counted) {
        expect(c.raw, `${s.id}/${c.name}`).toBeTruthy();
        expect(c.weight).toBeGreaterThan(0);
      }
    }
  });
});
