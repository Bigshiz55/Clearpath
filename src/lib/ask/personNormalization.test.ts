import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A NAME IS THE SAME NAME WHATEVER THE PUNCTUATION.
 *
 * ── THE PRODUCTION FAILURE THIS PINS ──────────────────────────────────────
 * "Looking for a good Samuel L Jackson movie I may not have seen" came back
 * with The Furious (2026), Backrooms (2026) and The End of Oak Street (2026),
 * each labelled "100 match". Not one of them has Samuel L. Jackson in it.
 *
 * The interpreter was right. It extracted
 *   people: [{ span: 'Samuel L Jackson', relation: 'required', role: 'any' }]
 *
 * The break is one line of normalization (`personReference.ts`):
 *   const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
 *
 * It collapses whitespace and lowercases but never touches punctuation, so
 *   norm('Samuel L Jackson')  === 'samuel l jackson'
 *   norm('Samuel L. Jackson') === 'samuel l. jackson'
 * are not equal, the exact-match branch misses, and the person comes back
 * UNRESOLVED — after which the constraint is silently dropped downstream and
 * the query runs as a generic recommendation.
 *
 * A period is not evidence about identity. Neither is a hyphen, an apostrophe
 * or an accent. What must stay decisive is the NAME.
 */

const searchPeople = vi.fn();
const getPersonCreditCount = vi.fn<(id: number) => Promise<number>>(async () => 500);
vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: (q: string) => searchPeople(q),
  getPersonCreditCount: (id: number) => getPersonCreditCount(id),
}));

const { resolvePersonReference } = await import('./personReference');

/** The catalog spells him with the period, as TMDB does. */
const SLJ = { id: 2231, name: 'Samuel L. Jackson', knownFor: 'Pulp Fiction' };

beforeEach(() => {
  vi.clearAllMocks();
  getPersonCreditCount.mockResolvedValue(500);
  searchPeople.mockResolvedValue([SLJ]);
});

describe('punctuation is not identity', () => {
  for (const spoken of [
    'Samuel L Jackson',
    'Samuel L. Jackson',
    'samuel l jackson',
    'SAMUEL L. JACKSON',
    '  Samuel   L.   Jackson  ',
  ]) {
    it(`resolves "${spoken}" to the same person, by exact-name evidence`, async () => {
      const r = await resolvePersonReference({ spokenAs: spoken, role: 'any' });
      expect(r.kind, `"${spoken}" must resolve`).toBe('resolved');
      if (r.kind === 'resolved') {
        expect(r.id).toBe(SLJ.id);
        // The claim must be the strong one: this is the same name, not a guess.
        expect(r.evidence).toBe('exact-name-match');
      }
    });
  }

  it('other punctuation forms normalize too — hyphen and apostrophe', async () => {
    searchPeople.mockResolvedValue([{ id: 3, name: "Joseph Gordon-Levitt", knownFor: 'Looper' }]);
    const r = await resolvePersonReference({ spokenAs: 'Joseph Gordon Levitt', role: 'any' });
    expect(r.kind).toBe('resolved');

    searchPeople.mockResolvedValue([{ id: 4, name: "Rosa D'Amico", knownFor: 'A Film' }]);
    const r2 = await resolvePersonReference({ spokenAs: 'Rosa DAmico', role: 'any' });
    expect(r2.kind).toBe('resolved');
  });

  it('NORMALIZATION IS NOT FUZZINESS — letters still decide', async () => {
    /* THE GUARD THAT KEEPS THIS HONEST, stated against the branch this change
       actually touches. Stripping punctuation must never manufacture an EXACT
       match between names that differ by letters: "Samuel Jackson" is missing
       a token "Samuel L. Jackson" has, so whatever else the resolver decides,
       it may not claim the two names are the same name.

       (The separate token-subsequence rule may still resolve a shortened name
       to a sole defensible candidate — that is the resolver's documented
       contract and predates this change. What is asserted here is only that
       the EXACT-name evidence is not counterfeited.) */
    searchPeople.mockResolvedValue([SLJ]);
    const r = await resolvePersonReference({ spokenAs: 'Samuel Jackson', role: 'any' });
    if (r.kind === 'resolved') {
      expect(r.evidence, 'a different string may not claim exact-name evidence').not.toBe('exact-name-match');
    }
  });

  it('and a name sharing no tokens does not resolve at all', async () => {
    searchPeople.mockResolvedValue([SLJ]);
    const r = await resolvePersonReference({ spokenAs: 'Greta Gerwig', role: 'any' });
    expect(r.kind).not.toBe('resolved');
  });
});
