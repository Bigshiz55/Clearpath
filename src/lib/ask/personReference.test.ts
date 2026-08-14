import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * IDENTITY IS EARNED BY EVIDENCE — FOR FULL NAMES TOO.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The defect this suite pins: for a multiword name with no exact normalized
 * match, the resolver accepted `credited[0]` — the catalog's ORDERING — and
 * labelled the evidence "sole-credited-match" when nothing sole had been
 * established. Response order is popularity, and popularity is not identity:
 * a fuzzy full-name miss with two plausible credited candidates was resolved
 * to whichever the catalog happened to list first, with a false receipt.
 *
 * The contract:
 *   FULL NAME  1. normalized exact UNIQUE match → resolve
 *              2. otherwise resolve ONLY when deterministic evidence leaves
 *                 exactly one defensible candidate (every spoken token
 *                 matches the candidate's name, in order, fuzzy per token)
 *              3. several plausible candidates → ambiguous (the route asks)
 *              4. nobody defensible → unresolved
 *   MONONYM    unique credited bearer, or ambiguous — unchanged.
 *
 * The evidence label must state what was actually proven.
 */

const searchPeople = vi.fn();
const getPersonCreditCount = vi.fn<(id: number) => Promise<number>>(async () => 0);
vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: (q: string) => searchPeople(q),
  getPersonCreditCount: (id: number) => getPersonCreditCount(id),
}));
vi.mock('server-only', () => ({}));

import { resolvePersonReference } from './personReference';

const STALLONE = { id: 16483, name: 'Sylvester Stallone', profilePath: null, knownFor: 'Rocky, Rambo' };
const FRANK = { id: 77, name: 'Frank Stallone', profilePath: null, knownFor: 'Rocky III' };
const DOWNEY = { id: 501, name: 'Robert Downey', profilePath: null, knownFor: 'Some Film' };
const DOWNEY_JR = { id: 3223, name: 'Robert Downey Jr.', profilePath: null, knownFor: 'Iron Man' };

beforeEach(() => {
  searchPeople.mockReset();
  searchPeople.mockResolvedValue([]);
  getPersonCreditCount.mockReset();
  getPersonCreditCount.mockResolvedValue(0);
});

const resolve = (spokenAs: string) => resolvePersonReference({ spokenAs, role: 'any' });

describe('RED — the fallback that trusted catalog order', () => {
  it('a fuzzy full name with TWO plausible credited candidates must ask, not take the first', async () => {
    // No exact normalized match for "Robert Downy"; both candidates carry
    // credits and both match the spoken tokens. Nothing makes the first one
    // uniquely defensible — the old code resolved it anyway.
    searchPeople.mockResolvedValue([DOWNEY, DOWNEY_JR]);
    const r = await resolve('Robert Downy');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map((c) => c.id)).toEqual([501, 3223]);
    }
  });

  it('catalog order flipped changes nothing — order is not identity', async () => {
    searchPeople.mockResolvedValue([DOWNEY_JR, DOWNEY]);
    const r = await resolve('Robert Downy');
    expect(r.kind).toBe('ambiguous');
  });

  it('a plausible-but-not-established first hit is never resolved with a "sole" label', async () => {
    searchPeople.mockResolvedValue([DOWNEY, DOWNEY_JR]);
    const r = await resolve('Robert Downy');
    expect(r.kind).not.toBe('resolved');
  });
});

describe('what still resolves, and with truthful evidence', () => {
  it('"Sylvester Stallone" — exact normalized unique match resolves', async () => {
    searchPeople.mockResolvedValue([STALLONE, FRANK]);
    const r = await resolve('Sylvester Stallone');
    expect(r).toMatchObject({ kind: 'resolved', id: 16483, evidence: 'exact-name-match' });
  });

  it('"Sylvester Stalone" — fuzzy, but only ONE credited candidate matches every spoken token', async () => {
    // Frank Stallone shares the surname but cannot match "Sylvester", so the
    // evidence leaves exactly one defensible candidate. This is the fuzzy
    // resolution the product already relies on live, kept — with a label that
    // says what was proven.
    searchPeople.mockResolvedValue([STALLONE, FRANK]);
    const r = await resolve('Sylvester Stalone');
    expect(r).toMatchObject({ kind: 'resolved', id: 16483, evidence: 'unique-credited-name-match' });
  });

  it('an uncredited exact stub does not outrank a credited exact person', async () => {
    searchPeople.mockResolvedValue([
      { id: 900, name: 'Tom Hanks', profilePath: null, knownFor: '' },
      { id: 31, name: 'Tom Hanks', profilePath: null, knownFor: 'Forrest Gump' },
    ]);
    const r = await resolve('Tom Hanks');
    expect(r).toMatchObject({ kind: 'resolved', id: 31, evidence: 'sole-credited-exact-match' });
  });

  it('two credited people with the same exact name → ambiguous', async () => {
    searchPeople.mockResolvedValue([
      { id: 1, name: 'John Smith', profilePath: null, knownFor: 'A' },
      { id: 2, name: 'John Smith', profilePath: null, knownFor: 'B' },
    ]);
    const r = await resolve('John Smith');
    expect(r.kind).toBe('ambiguous');
  });

  it('nobody defensible → unresolved, never a guess', async () => {
    searchPeople.mockResolvedValue([{ id: 5, name: 'Jane Bond', profilePath: null, knownFor: '' }]);
    const r = await resolve('Jane Bnod');
    expect(r.kind).toBe('unresolved');
  });
});

describe('exact-name namesakes resolve on catalog evidence, never on order', () => {
  const FAMOUS = { id: 525, name: 'Christopher Nolan', profilePath: null, knownFor: 'Inception, Oppenheimer', knownForDepartment: 'Directing' };
  const NAMESAKE = { id: 9001, name: 'Christopher Nolan', profilePath: null, knownFor: 'Small Film', knownForDepartment: 'Acting' };

  it('a DIRECTOR ask with one Directing-department bearer resolves that bearer', async () => {
    searchPeople.mockResolvedValue([NAMESAKE, FAMOUS]);
    const r = await resolvePersonReference({ spokenAs: 'Christopher Nolan', role: 'director' });
    expect(r).toMatchObject({ kind: 'resolved', id: 525, evidence: 'sole-role-consistent-exact-match' });
    expect(getPersonCreditCount, 'no filmography fetch needed — the role decided').not.toHaveBeenCalled();
  });

  it('an ACTOR ask never department-matches its way to a namesake — dominance decides', async () => {
    searchPeople.mockResolvedValue([NAMESAKE, FAMOUS]);
    getPersonCreditCount.mockImplementation(async (id) => (id === 525 ? 60 : 4));
    const r = await resolvePersonReference({ spokenAs: 'Christopher Nolan', role: 'actor' });
    expect(r).toMatchObject({ kind: 'resolved', id: 525, evidence: 'dominant-filmography-exact-match' });
  });

  it('rivals of comparable substance stay a question', async () => {
    searchPeople.mockResolvedValue([
      { id: 1, name: 'John Smith', profilePath: null, knownFor: 'A', knownForDepartment: 'Acting' },
      { id: 2, name: 'John Smith', profilePath: null, knownFor: 'B', knownForDepartment: 'Acting' },
    ]);
    getPersonCreditCount.mockImplementation(async (id) => (id === 1 ? 12 : 9));
    const r = await resolvePersonReference({ spokenAs: 'John Smith', role: 'any' });
    expect(r.kind).toBe('ambiguous');
  });
});
