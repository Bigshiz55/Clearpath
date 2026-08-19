import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TASTE DNA REACHES ASK — the five properties that make that safe.
 *
 * Ask sorted on `matchScore`, the deterministic QUALITY verdict, and imported
 * none of the personalization stack that `/app/watch` and `/browse` have used
 * for a long time. This suite pins what changed and, more importantly, what
 * must not: taste decides the ORDER of eligible answers and never their
 * MEMBERSHIP, and it never claims a preference it cannot point at.
 */

const loadPreferenceCached = vi.fn();
const getUserDimensionProfile = vi.fn();
const getCachedDimensions = vi.fn();

vi.mock('server-only', () => ({}));
vi.mock('@/lib/preference/store', () => ({ loadPreferenceCached }));
vi.mock('@/lib/titleDimensions', () => ({ getUserDimensionProfile, getCachedDimensions }));

const { personalizeCandidates } = await import('./personalRanking');

const supabase = {} as never;

/** Two titles of IDENTICAL quality, so any ordering change is taste alone. */
const GROUNDED = { id: 1, mediaType: 'movie' as const, matchScore: 70, genreNames: ['Crime', 'Drama'] };
const SUPERNATURAL = { id: 2, mediaType: 'movie' as const, matchScore: 70, genreNames: ['Horror'] };
const ITEMS = [GROUNDED, SUPERNATURAL];

/** The engine's real axes — a partial fingerprint is not a fingerprint. */
const KEYS = ['pacing','darkness','warmth','humor','suspense','emotion','complexity','realism','character','stakes','morality','violence','attention','serialized','romance'] as const;
const fingerprint = (over: Partial<Record<(typeof KEYS)[number], number>>): Record<string, number> =>
  Object.fromEntries(KEYS.map((k) => [k, over[k] ?? 50]));

/** One grounded and character-driven; one dark and supernatural in feel. */
const DIMS = new Map<string, Record<string, number>>([
  ['movie-1', fingerprint({ realism: 92, character: 90, darkness: 35 })],
  ['movie-2', fingerprint({ realism: 8, character: 20, darkness: 95 })],
]);

const profileFor = (pref: Partial<Record<(typeof KEYS)[number], number>>) => ({
  pref: fingerprint(pref),
  weight: Object.fromEntries(KEYS.map((k) => [k, pref[k] != null ? 1 : 0])),
  samples: 25,
});

const emptyChannel = () => ({ dims: {}, genres: {}, people: {}, samples: 0 });
/** TraitBelief is { pref, evidence } — a mean and how much evidence backs it. */
const dnaWith = (dims: Record<string, { pref: number; evidence: number }>) => ({
  // `samples` is what `hasPreferenceSignal` reads — without it the channel is
  // indistinguishable from a user who has told us nothing.
  experience: { ...emptyChannel(), dims, samples: 24 },
  attraction: emptyChannel(),
  discovery: emptyChannel(),
});

beforeEach(() => {
  vi.clearAllMocks();
  getCachedDimensions.mockResolvedValue(DIMS);
});

describe('1 — DNA CHANGES RANKING', () => {
  it('two users, same request, same candidates, DIFFERENT order', async () => {
    // Reader A's history leans grounded and character-driven.
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 95, character: 92, darkness: 20 }));
    loadPreferenceCached.mockResolvedValue(null);
    const a = await personalizeCandidates(supabase, 'user-a', ITEMS);

    // Reader B's leans the other way entirely.
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 8, character: 15, darkness: 95 }));
    const b = await personalizeCandidates(supabase, 'user-b', ITEMS);

    const orderOf = (r: Awaited<ReturnType<typeof personalizeCandidates>>) =>
      [...r].sort((x, y) => y.personal.rankScore - x.personal.rankScore).map((i) => i.id);

    expect(orderOf(a)).toEqual([1, 2]);
    expect(orderOf(b), 'the other reader must get the other order').toEqual([2, 1]);
  });

  it('and the quality score itself is untouched — only the rank moved', async () => {
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 95, darkness: 20 }));
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'user-a', ITEMS);
    for (const i of out) expect(i.matchScore).toBe(70);
  });
});

describe('2 — HARD CONSTRAINTS REMAIN PROTECTED', () => {
  it('personalization returns exactly the candidates it was given — never more', async () => {
    /* The structural guarantee, stated exactly: this MAPS, it never filters,
       so the set it returns is the set it was handed. It cannot add a title to
       the answer and cannot save one from the downstream gate. (It does NOT
       run after the person/media gate — see the note in personalSignal.ts —
       which is why this property, not that ordering, is what protects
       membership.) */
    getUserDimensionProfile.mockResolvedValue(profileFor({ darkness: 99 }));
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'user-b', ITEMS);
    expect(out.map((i) => i.id).sort()).toEqual([1, 2]);
    expect(out).toHaveLength(ITEMS.length);
  });

  it('the strongest possible taste cannot outweigh a decisive quality gap', async () => {
    const strong = { id: 3, mediaType: 'movie' as const, matchScore: 95, genreNames: ['Horror'] };
    const weak = { id: 4, mediaType: 'movie' as const, matchScore: 50, genreNames: ['Crime'] };
    getCachedDimensions.mockResolvedValue(
      new Map([
        ['movie-3', fingerprint({ realism: 0, darkness: 100 })],
        ['movie-4', fingerprint({ realism: 100, darkness: 0 })],
      ]),
    );
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 100, darkness: 0 }));
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'user-a', [strong, weak]);
    const byRank = [...out].sort((a, b) => b.personal.rankScore - a.personal.rankScore);
    expect(byRank[0]!.id, 'a 95 the reader dislikes still beats a 50 they love').toBe(3);
  });
});

describe('3 — NO DNA DEGRADES HONESTLY', () => {
  it('a guest gets no personal score and the original order', async () => {
    const out = await personalizeCandidates(supabase, null, ITEMS);
    expect(out.every((i) => i.personal.personalScore === null)).toBe(true);
    expect(out.map((i) => i.personal.rankScore)).toEqual([70, 70]);
    expect(loadPreferenceCached).not.toHaveBeenCalled();
  });

  it('a signed-in user with nothing on file gets no FAKE personal score', async () => {
    getUserDimensionProfile.mockResolvedValue({ pref: {}, weight: {}, samples: 0 });
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'new-user', ITEMS);
    expect(out.every((i) => i.personal.personalScore === null)).toBe(true);
    expect(out.every((i) => i.personal.participated === false)).toBe(true);
  });

  it('a title we have never fingerprinted is not scored as "average fit"', async () => {
    getCachedDimensions.mockResolvedValue(new Map()); // nothing cached
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 95 }));
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'user-a', ITEMS);
    expect(out.every((i) => i.personal.personalScore === null)).toBe(true);
  });

  it('a store failure never breaks the request — the quality order stands', async () => {
    getUserDimensionProfile.mockRejectedValue(new Error('db down'));
    getCachedDimensions.mockRejectedValue(new Error('db down'));
    loadPreferenceCached.mockRejectedValue(new Error('db down'));
    const out = await personalizeCandidates(supabase, 'user-a', ITEMS);
    expect(out.map((i) => i.personal.rankScore)).toEqual([70, 70]);
  });
});

describe('4 — EXPLICIT USER PREFERENCES ARE REFLECTED', () => {
  it('a reader who likes grounded and avoids supernatural ranks accordingly', async () => {
    getUserDimensionProfile.mockResolvedValue({ pref: {}, weight: {}, samples: 0 });
    loadPreferenceCached.mockResolvedValue({
      dna: dnaWith({ realism: { pref: 95, evidence: 12 }, darkness: { pref: 15, evidence: 12 }, character: { pref: 90, evidence: 10 } }),
      corrections: {},
    });
    const out = await personalizeCandidates(supabase, 'scott', ITEMS);
    const byId = new Map(out.map((i) => [i.id, i]));
    expect(byId.get(1)!.personal.rankScore).toBeGreaterThan(byId.get(2)!.personal.rankScore);
  });
});

describe('5 — EVERY EXPLANATION POINTS AT REAL EVIDENCE', () => {
  it('reasons and concerns name the actual axis, never "movies like this"', async () => {
    getUserDimensionProfile.mockResolvedValue({ pref: {}, weight: {}, samples: 0 });
    loadPreferenceCached.mockResolvedValue({
      dna: dnaWith({ realism: { pref: 95, evidence: 20 }, darkness: { pref: 10, evidence: 20 }, character: { pref: 92, evidence: 20 } }),
      corrections: {},
    });
    const out = await personalizeCandidates(supabase, 'scott', ITEMS);
    const said = out.flatMap((i) => [...i.personal.evidence.reasons, ...i.personal.evidence.concerns]);

    expect(said.length, 'a personalized result must be able to say why').toBeGreaterThan(0);
    for (const r of said) {
      expect(r.key, 'every reason cites the signal it came from').toBeTruthy();
      expect(r.strength).toBeGreaterThan(0);
      expect(r.text.toLowerCase()).not.toContain('movies like this');
    }
  });

  it('a candidate with no participation carries no reasons at all', async () => {
    getUserDimensionProfile.mockResolvedValue({ pref: {}, weight: {}, samples: 0 });
    loadPreferenceCached.mockResolvedValue(null);
    const out = await personalizeCandidates(supabase, 'nobody', ITEMS);
    for (const i of out) {
      expect(i.personal.evidence.reasons).toEqual([]);
      expect(i.personal.evidence.concerns).toEqual([]);
    }
  });
});

describe('COST — O(1) queries, never O(candidates)', () => {
  it('one preference read, one profile read, one batched fingerprint read', async () => {
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 90 }));
    loadPreferenceCached.mockResolvedValue(null);
    const many = Array.from({ length: 60 }, (_, n) => ({
      id: n + 100, mediaType: 'movie' as const, matchScore: 70, genreNames: ['Drama'],
    }));
    await personalizeCandidates(supabase, 'user-a', many);
    expect(loadPreferenceCached).toHaveBeenCalledTimes(1);
    expect(getUserDimensionProfile).toHaveBeenCalledTimes(1);
    expect(getCachedDimensions, 'the fingerprint lookup is batched, not per title').toHaveBeenCalledTimes(1);
    expect(getCachedDimensions.mock.calls[0]![0]).toHaveLength(60);
  });
});

describe('7 — NO PAID CLASSIFICATION FROM A BULK PATH', () => {
  it('asks for the profile with the backfill DISABLED', async () => {
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 90 }));
    loadPreferenceCached.mockResolvedValue(null);
    await personalizeCandidates(supabase, 'user-a', ITEMS);

    /* The default profile build classifies missing fingerprints with a paid
       gpt-4o-mini call inside the request. Ask must never opt into that, and
       `titleDimensions.backfill.test.ts` proves the flag actually suppresses
       the network call rather than merely being passed along. */
    expect(getUserDimensionProfile).toHaveBeenCalledWith(
      supabase,
      'user-a',
      expect.anything(),
      expect.objectContaining({ backfill: false }),
    );
  });

  it('reads fingerprints in ONE batched call, never per candidate', async () => {
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 90 }));
    loadPreferenceCached.mockResolvedValue(null);
    await personalizeCandidates(supabase, 'user-a', ITEMS);

    expect(getCachedDimensions).toHaveBeenCalledTimes(1);
    expect(getCachedDimensions.mock.calls[0]![0]).toHaveLength(ITEMS.length);
  });
});

describe('8 — TASTE DNA CANNOT RESCUE A SUBJECT-INELIGIBLE TITLE', () => {
  /* THE CHESS INCIDENT, AS A PROPERTY. "movies about chess" answered with
     Spider-Man. The interpreter defect that caused it is fixed elsewhere; this
     pins the half that belongs to personalization, and it must hold even if a
     subject fails to bind again for some other reason.

     A superhero blockbuster is exactly the title a Marvel-loving profile would
     promote. Eligibility runs first and is not consulted here: `finder.ts`
     hands this layer only what survived the subject pre-filter, and the
     person/media gate filters downstream on each candidate's own facts. So the
     ineligible title is either absent, or removed after — never rescued. */
  it('a title the subject gate rejected is not in the pool, whatever taste thinks of it', async () => {
    const CHESS_FILM = { id: 101, mediaType: 'movie' as const, matchScore: 60, genreNames: ['Drama'] };
    const SUPERHERO = { id: 102, mediaType: 'movie' as const, matchScore: 95, genreNames: ['Action', 'Adventure'] };

    getCachedDimensions.mockResolvedValue(
      new Map([
        ['movie-101', fingerprint({ realism: 90, character: 88, stakes: 20 })],
        ['movie-102', fingerprint({ realism: 10, character: 25, stakes: 99 })],
      ]),
    );
    // A reader who loves exactly what the blockbuster is.
    getUserDimensionProfile.mockResolvedValue(profileFor({ realism: 5, character: 20, stakes: 100 }));
    loadPreferenceCached.mockResolvedValue(null);

    // What the finder passes in: the subject survivors ONLY.
    const eligible = [CHESS_FILM];
    const out = await personalizeCandidates(supabase, 'marvel-fan', eligible);

    expect(out.map((i) => i.id)).toEqual([101]);
    expect(out.map((i) => i.id), 'taste must not conjure the ineligible blockbuster').not.toContain(102);
    // And the surviving title keeps a real score rather than being zeroed for
    // failing to match this reader's taste.
    expect(out[0]!.personal.rankScore).toBeGreaterThan(0);
  });

  it('even ranked first, an ineligible title is dropped by the gate downstream', async () => {
    // Ranking cannot pre-empt the gate: hardConstraints.test.ts pins that
    // qualifyCandidates returns the same survivors whatever order it is handed.
    // Here we only assert this layer never changes the SET it was given.
    getUserDimensionProfile.mockResolvedValue(profileFor({ stakes: 100 }));
    loadPreferenceCached.mockResolvedValue(null);
    const pool = [
      { id: 201, mediaType: 'movie' as const, matchScore: 40, genreNames: ['Drama'] },
      { id: 202, mediaType: 'movie' as const, matchScore: 90, genreNames: ['Action'] },
    ];
    const out = await personalizeCandidates(supabase, 'marvel-fan', pool);
    expect(new Set(out.map((i) => i.id))).toEqual(new Set([201, 202]));
    expect(out).toHaveLength(pool.length);
  });
});
