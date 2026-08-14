import { describe, it, expect } from 'vitest';
import { requestedCreditRole } from './creditRole';

/**
 * The role a sentence asks for, read on the LANGUAGE side of the boundary.
 *
 * These cases lived in `people/constraint.test.ts` while the reader itself lived
 * in the execution layer. Both moved together: execution consumes a typed role
 * and has no prose in it, which `roleExecution.test.ts` asserts directly.
 */
describe('requestedCreditRole', () => {
  const CASES: Array<[string, string | null]> = [
    ['movies directed by Christopher Nolan', 'director'],
    ['films of Christopher Nolan', 'director'],
    ['movies written by Aaron Sorkin', 'writer'],
    ['shows created by Vince Gilligan', 'creator'],
    ['what should I watch tonight with Tom Hanks', 'actor'],
    ['movies starring Denzel Washington', 'actor'],
    ['find me 3 Sylvester Stallone movies', null],
  ];
  for (const [said, role] of CASES) {
    it(`"${said}" → ${role ?? 'unstated'}`, () => expect(requestedCreditRole(said)).toBe(role));
  }

  it('an unstated role is null, so the caller defaults deliberately', () => {
    // "3 Stallone movies" names no role; the caller chooses `actor` explicitly
    // rather than this function pretending the sentence said so.
    expect(requestedCreditRole('find me 3 Sylvester Stallone movies')).toBeNull();
  });
});
