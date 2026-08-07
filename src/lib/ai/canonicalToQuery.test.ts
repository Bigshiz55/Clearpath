import { describe, it, expect } from 'vitest';
import { canonicalToQuery } from './canonicalToQuery';
import { CanonicalDiscoveryRequestSchema } from './schemas';

/**
 * QUALIFY FIRST — PERSONALIZE SECOND is enforced by the mapping: a required
 * subject becomes a strict eligibility gate (subjectLexemes + subjectStrict),
 * never a soft genre; excluded subjects/people are carried as hard removals; an
 * exact date bound is preserved as an exact calendar boundary. These lock the
 * spec's adversarial cases at the mapping layer (entity ids are resolved by the
 * route via real tools, so they appear in pendingResolution, not here).
 */
function parse(input: unknown) {
  return CanonicalDiscoveryRequestSchema.parse(input);
}

describe('canonicalToQuery — hard constraints survive mapping', () => {
  it('"other shows like Criminal Minds" keeps the reference and TV type, invents nothing', () => {
    const req = parse({
      intent: 'similar',
      mediaTypes: ['tv'],
      referenceTitles: [{ text: 'Criminal Minds', relationship: 'similar_to' }],
      interpretationSummary: 'shows like Criminal Minds',
    });
    const { query, pendingResolution } = canonicalToQuery(req);
    expect(query.mediaType).toBe('tv');
    expect(pendingResolution.referenceTitles).toEqual([{ text: 'Criminal Minds', relationship: 'similar_to' }]);
    // No genre was invented from the reference.
    expect(query.genreIds).toEqual([]);
    expect(query.similarTo).toContain('Criminal Minds');
  });

  it('"a boxing movie from the last 20 years" is a strict subject gate + exact date bound', () => {
    const req = parse({
      intent: 'discover',
      mediaTypes: ['movie'],
      hardConstraints: { requiredSubjects: ['boxing'], releaseDateMin: '2006-08-07' },
      interpretationSummary: 'a boxing movie made within the last 20 years',
    });
    const { query, pendingResolution } = canonicalToQuery(req);
    expect(query.mediaType).toBe('movie');
    expect(query.subjectStrict).toBe(true);
    expect(query.subjectLexemes).toContain('boxing');
    expect(query.minReleaseDate).toBe('2006-08-07');
    expect(pendingResolution.requiredSubjects).toEqual(['boxing']);
    // Boxing is NOT mapped to a genre — it is a qualification gate.
    expect(query.genreIds).toEqual([]);
  });

  it('"Rocky\'s underdog feeling but not boxing" keeps similarity theme AND excludes the subject', () => {
    const req = parse({
      intent: 'similar',
      referenceTitles: [{ text: 'Rocky', relationship: 'similar_to' }],
      hardConstraints: { excludedSubjects: ['boxing'] },
      softPreferences: { themes: ['underdog'] },
      interpretationSummary: 'something with Rocky\'s underdog feeling but not boxing',
    });
    const { query, pendingResolution } = canonicalToQuery(req);
    expect(pendingResolution.referenceTitles.map((r) => r.text)).toContain('Rocky');
    expect(pendingResolution.excludedSubjects).toContain('boxing');
    // Boxing must NOT become a required subject here.
    expect(query.subjectLexemes ?? []).not.toContain('boxing');
  });

  it('excluded genre name maps to a real TMDB genre id (documentary → 99)', () => {
    const req = parse({
      intent: 'discover',
      hardConstraints: { excludedGenres: ['documentary'] },
      interpretationSummary: 'no documentaries',
    });
    const { query } = canonicalToQuery(req);
    expect(query.excludeGenreIds).toContain(99);
  });

  it('runtime cap and monetization are carried as hard constraints', () => {
    const req = parse({
      intent: 'discover',
      hardConstraints: { runtimeMaxMinutes: 120, requiredMonetization: ['flatrate', 'free'] },
      interpretationSummary: 'under two hours, included with a subscription',
    });
    const { query } = canonicalToQuery(req);
    expect(query.maxRuntime).toBe(120);
    expect(query.monetization).toBe('flatrate|free');
  });

  it('surfaces a clarification request instead of a search', () => {
    const req = parse({
      intent: 'clarify',
      clarificationRequired: true,
      ambiguities: [{ field: 'mediaType', question: 'Movie or show?', options: ['movie', 'tv'] }],
      interpretationSummary: 'needs to know movie vs show',
    });
    expect(canonicalToQuery(req).clarify).toBe(true);
  });
});
