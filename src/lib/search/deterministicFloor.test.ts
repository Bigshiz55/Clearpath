import { describe, it, expect } from 'vitest';
import { applyDeterministicFloor, overlayAi } from './deterministicFloor';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import type { FinderQuery } from '@/lib/finder';

/**
 * THE INVARIANT, ADVERSARIALLY.
 *
 *   AI may enhance interpretation, but failure or absence of AI must never
 *   erase deterministic understanding the system already possesses.
 *
 * Every case below uses SEVERAL UNRELATED constraints at once and asserts on
 * all of them, because the defect this guards is not "one field was dropped" —
 * it is "a whole parse was replaced by a partial one". A test that watched a
 * single field would pass while the other five vanished.
 *
 * No case asserts on a phrase. The sentences are inputs; what is asserted is
 * that whatever `naiveParseQuery` understood from them SURVIVES. Add a new
 * constraint to the parser tomorrow and these cases cover it unchanged.
 */

/** Several unrelated constraints in one sentence: runtime, year, genre, rating. */
const MULTI = 'a crime movie under 100 minutes after 2015 with imdb above 7';

/** What the deterministic parser understands from it — the thing to protect. */
const det = () => naiveParseQuery(MULTI);

/** Every field the deterministic parse actually filled, as [key, value] pairs. */
function statedFields(q: FinderQuery): [string, unknown][] {
  const neutral = EMPTY_QUERY as unknown as Record<string, unknown>;
  const src = q as unknown as Record<string, unknown>;
  return Object.keys(neutral).filter((k) => {
    const v = src[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return v !== neutral[k];
  }).map((k) => [k, src[k]]);
}

describe('the deterministic parse is worth protecting', () => {
  it('understands several unrelated constraints from one sentence', () => {
    const fields = statedFields(det());
    // If this ever drops to one, the cases below stop being adversarial.
    expect(fields.length, `parsed: ${JSON.stringify(fields)}`).toBeGreaterThanOrEqual(3);
  });
});

describe('AI absence must never erase deterministic understanding', () => {
  it('NO API KEY — parseAskWithAI yields null; every stated constraint survives', () => {
    // `parseAskWithAI` returns null with no key. That is this exact input.
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, null), det());
    for (const [k, v] of statedFields(det())) {
      expect((merged as unknown as Record<string, unknown>)[k], `${k} was erased`).toEqual(v);
    }
  });

  it('AI RETURNS NULL — indistinguishable from absence, and equally harmless', () => {
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, null), det());
    expect(statedFields(merged).length).toBeGreaterThanOrEqual(statedFields(det()).length);
  });

  it('AI TIMES OUT / THROWS — the caller sees null, so the floor still holds', () => {
    // parseAskWithAI catches everything and returns null; simulate that contract.
    const aiResult: FinderQuery | null = null;
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, aiResult), det());
    for (const [k, v] of statedFields(det())) {
      expect((merged as unknown as Record<string, unknown>)[k], `${k} was erased`).toEqual(v);
    }
  });

  it('AI RETURNS PARTIAL INTENT — the fields it left null do not blank the parse', () => {
    // The realistic failure: a COMPLETE query object with one field filled and
    // every other field null. A plain spread would erase the rest.
    const partial: FinderQuery = { ...EMPTY_QUERY, mediaType: 'movie' };
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, partial), det());
    expect(merged.mediaType).toBe('movie'); // AI's contribution kept
    for (const [k, v] of statedFields(det())) {
      if (k === 'mediaType') continue;
      expect((merged as unknown as Record<string, unknown>)[k], `${k} was erased by a partial parse`).toEqual(v);
    }
  });
});

describe('AI may still enhance', () => {
  it('AI AGREES — the merged result is the same understanding, not a doubled one', () => {
    const agreeing = { ...det() };
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, agreeing), det());
    expect(merged).toEqual(applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, null), det()));
  });

  it('AI ADDS LEGITIMATE SEMANTICS — a field the regex could not reach is kept', () => {
    // `pace` is a judgment the deterministic parser does not make from this
    // sentence. AI supplying it is the whole point of having AI.
    const enriched: FinderQuery = { ...EMPTY_QUERY, pace: 85 };
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, enriched), det());
    expect(merged.pace, 'AI enrichment was discarded').toBe(85);
    for (const [k, v] of statedFields(det())) {
      expect((merged as unknown as Record<string, unknown>)[k], `${k} lost to enrichment`).toEqual(v);
    }
  });

  it('AI FILLS A GAP the deterministic parse left — kept, because nothing is erased', () => {
    const d = naiveParseQuery('something funny'); // few or no hard bounds
    const enriched: FinderQuery = { ...EMPTY_QUERY, minAudience: 70 };
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, enriched), d);
    expect(merged.minAudience).toBe(70);
  });
});

describe('AI conflicting with an explicit deterministic hard constraint', () => {
  it('the number the user TYPED wins over the number the model inferred', () => {
    const d = det();
    expect(d.maxRuntime, 'fixture must state a runtime').not.toBeNull();
    const conflicting: FinderQuery = { ...EMPTY_QUERY, maxRuntime: (d.maxRuntime ?? 0) + 80 };
    const merged = applyDeterministicFloor(overlayAi({ ...EMPTY_QUERY }, conflicting), d);
    expect(merged.maxRuntime, 'an inferred bound overrode a stated one').toBe(d.maxRuntime);
  });

  it('…and that holds for every numeric bound the sentence stated, not just one', () => {
    const d = det();
    const bumped = { ...EMPTY_QUERY } as unknown as Record<string, unknown>;
    for (const [k, v] of statedFields(d)) if (typeof v === 'number') bumped[k] = v + 13;
    const merged = applyDeterministicFloor(
      overlayAi({ ...EMPTY_QUERY }, bumped as unknown as FinderQuery),
      d,
    );
    for (const [k, v] of statedFields(d)) {
      if (typeof v !== 'number') continue;
      expect((merged as unknown as Record<string, unknown>)[k], `${k}: inferred value beat the stated one`).toEqual(v);
    }
  });
});

describe('explicit UI state', () => {
  it('a stale slider value is not resurrected by the floor', () => {
    // The floor only ever writes what the SENTENCE said. A field the sentence
    // is silent about is left exactly as the caller supplied it.
    const supplied: FinderQuery = { ...EMPTY_QUERY, minMatch: 90 };
    const merged = applyDeterministicFloor(overlayAi(supplied, null), naiveParseQuery('something funny'));
    expect(merged.minMatch).toBe(90);
  });

  it('is overridden where the sentence states a bound explicitly', () => {
    const d = det();
    const supplied: FinderQuery = { ...EMPTY_QUERY, maxRuntime: 240 };
    const merged = applyDeterministicFloor(overlayAi(supplied, null), d);
    expect(merged.maxRuntime).toBe(d.maxRuntime);
  });
});

describe('the floor is inert when there is nothing to protect', () => {
  it('no text → identity', () => {
    const supplied: FinderQuery = { ...EMPTY_QUERY, minImdb: 8, genreIds: [80] };
    expect(applyDeterministicFloor(supplied, null)).toEqual(supplied);
  });

  it('a sentence with no parsable constraints changes nothing', () => {
    const supplied: FinderQuery = { ...EMPTY_QUERY, minImdb: 8 };
    const merged = applyDeterministicFloor(supplied, naiveParseQuery('hello'));
    expect(merged.minImdb).toBe(8);
  });

  it('overlayAi with null is the identity', () => {
    const supplied: FinderQuery = { ...EMPTY_QUERY, minImdb: 8 };
    expect(overlayAi(supplied, null)).toEqual(supplied);
  });
});
