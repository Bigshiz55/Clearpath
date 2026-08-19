/**
 * A NEGATED PACE WORD HAS A PACE HOME — IT WAS BEING SENT TO KEYWORDS.
 *
 * P0-C fixed the parser: "a thriller that isn't slow" records `slow` with
 * `wanted: false` instead of recording it as a positive filter. The mapper then
 * threw that away. A WANTED tone with a pace home sets `pace`; a VETOED one
 * fell to the unmapped-veto channel and left as a `without_keywords` exclusion
 * on the word "slow" — and almost nothing in a catalogue is TAGGED "slow", so
 * the request executed as a bare genre browse. The negation was understood,
 * recorded, disclosed, and then had nowhere to go.
 *
 * `pace` is a 0..100 band the finder already filters on in both directions, so
 * the opposite end is not an invention: it is the same primitive, read the way
 * the sentence meant it. An explicitly stated pace still wins — a veto only
 * fills a band nobody claimed.
 */
import { describe, it, expect } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { intentToQuery } from './canonicalExecution';

const q = (text: string) => {
  const mapped = intentToQuery(interpret(text)) as unknown as {
    query: { pace: number | null; genreIds: number[] };
    pending: { excludedSubjects: string[] };
    undeliverableTones: string[];
  };
  return mapped;
};

describe('a vetoed pace word reaches the pace primitive', () => {
  it('the contracted-negation sentence executes as fast, not as a keyword exclusion', () => {
    const m = q("a thriller that isn't slow");
    expect(m.query.pace, 'the negation never reached execution').not.toBeNull();
    expect(m.query.pace!).toBeGreaterThan(50);
    expect(m.pending.excludedSubjects, 'a pace word does not belong in keyword exclusions').not.toContain('slow');
  });

  it('and so does the verb form people actually use', () => {
    const m = q('I want a thriller, nothing that drags');
    expect(m.query.pace).not.toBeNull();
    expect(m.query.pace!).toBeGreaterThan(50);
  });

  it('a wanted pace word is unchanged', () => {
    expect(q('a slow burn drama').query.pace).toBeLessThan(50);
    expect(q('something fast-paced').query.pace).toBeGreaterThan(50);
  });

  it('an explicitly stated pace wins over a veto — a veto only fills an empty band', () => {
    const m = q('a slow movie that is not fast-paced');
    expect(m.query.pace).toBeLessThan(50);
  });

  it('a vetoed tone with no pace home still goes to the exclusion channel', () => {
    const m = q('a thriller, nothing gory');
    expect(m.query.pace).toBeNull();
    expect(m.pending.excludedSubjects).toContain('gory');
  });

  it('a vetoed tone that IS a genre still excludes the genre', () => {
    const m = q('something good, nothing romantic');
    expect(m.pending.excludedSubjects).not.toContain('romantic');
  });
});
