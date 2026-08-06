/**
 * The query SHAPE the /api/finder route produces for a required-subject ask —
 * proving the exact live failure is fixed at the plan level, with the TMDB
 * keyword lookup mocked (the only I/O). Everything else is the real code path.
 *
 * The bug: "a boxing movie … last 20 years" produced { genreIds:[2 genres] }
 * with no subject, so the chips read "Movies · Last 20 yr · 2 genres" and boxing
 * was gone. After the fix the query must carry the subject as a hard constraint,
 * drop the proxy genres, and the chips must read "Movies · Boxing · Last 20 yr".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ONLY the TMDB keyword resolution — the single I/O call. Boxing terms →
// two real-looking keyword ids; the wrestling term → a different id.
vi.mock('@/lib/tmdb/client', () => ({
  searchKeywords: vi.fn(async (terms: string[]) => {
    if (terms.some((t) => /box|prizefight/i.test(t))) return [1234, 5678];
    if (terms.some((t) => /wrestl/i.test(t))) return [9999];
    return [];
  }),
}));

import { applyRequiredSubject } from './finderSubject';
import { activeFilterChips } from './refineState';
import { EMPTY_QUERY } from './finderParse';
import type { FinderQuery } from './finder';

// The query as the AI parser degraded it: movie, 20-year recency, and two
// genres standing in for "boxing" — exactly the production failure.
const AI_DEGRADED: FinderQuery = {
  ...EMPTY_QUERY,
  mediaType: 'movie',
  genreIds: [18, 28], // drama, action — the "2 genres" the user saw
  sinceMonths: 240,
};

describe('required-subject query shape (the live /api/finder failure)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('boxing becomes a hard subject; proxy genres are dropped', async () => {
    const { query } = await applyRequiredSubject(
      { ...AI_DEGRADED },
      "Find me a boxing movie that I would like that's been made within the last 20 years",
    );
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
    expect(query.subjectLabel).toBe('Boxing');
    expect(query.subjectCanonical).toBe('boxing');
    expect(query.genreIds).toEqual([]); // the proxy genres are gone
    expect(query.mediaType).toBe('movie');
  });

  it('"made within the last 20 years" → exact release-date boundary + disclosure', async () => {
    const { query, interpretation } = await applyRequiredSubject(
      { ...AI_DEGRADED },
      "a boxing movie that's been made within the last 20 years",
    );
    expect(query.minReleaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const boundaryYear = Number(query.minReleaseDate!.slice(0, 4));
    expect(new Date().getUTCFullYear() - boundaryYear).toBe(20);
    expect(interpretation.join(' ')).toMatch(/treated .made. as released within the last 20 years/i);
  });

  it('the chips read "Movies · Boxing · Last 20 yr" — never "2 genres"', async () => {
    const { query } = await applyRequiredSubject(
      { ...AI_DEGRADED },
      'a boxing movie made within the last 20 years',
    );
    const chips = activeFilterChips(query);
    expect(chips).toContain('Movies');
    expect(chips).toContain('Boxing');
    expect(chips).toContain('Last 20 yr');
    expect(chips.some((c) => /genre/i.test(c))).toBe(false);
  });

  it('an explicit genre survives: "a boxing drama" keeps the genre', async () => {
    const { query } = await applyRequiredSubject(
      { ...AI_DEGRADED, genreIds: [18] },
      'a recent boxing drama',
    );
    expect(query.subjectLabel).toBe('Boxing');
    expect(query.genreIds).toEqual([18]); // drama kept — the user named it
  });

  it('"a boxing movie, not wrestling" sets an exclusion, keeps boxing required', async () => {
    const { query } = await applyRequiredSubject({ ...AI_DEGRADED }, 'a boxing movie, not wrestling');
    expect(query.subjectKeywordIds).toEqual([1234, 5678]);
    expect(query.excludeKeywordIds).toEqual([9999]);
  });
});
