/**
 * FROZEN HARD-SUBJECT CORPUS v1 — append-only.
 *
 * The live P1: signed-in Forensic Search for "a boxing movie … within the last
 * 20 years" returned Avatar / Spider-Verse / The Dark Knight because the subject
 * "boxing" was degraded into genres. These cases freeze the DETERMINISTIC
 * subject decision that makes that impossible: boxing is required and is never
 * conflated with wrestling, MMA, or martial arts; a negated subject is excluded,
 * not required; and a genre word co-occurring is detected so genres survive only
 * when explicitly asked for.
 *
 * Do NOT weaken an expectation to make a future change pass — add a new case.
 */
import { describe, it, expect } from 'vitest';
import { detectRequiredSubject } from './requiredSubject';

const req = (t: string) => detectRequiredSubject(t).required?.canonical ?? null;
const exc = (t: string) => detectRequiredSubject(t).excluded.map((s) => s.canonical).sort();

describe('hard-subject corpus v1 — required subject is detected and isolated', () => {
  const REQUIRE_BOXING = [
    "Find me a boxing movie that I would like that's been made within the last 20 years",
    'Boxing movies from the last 20 years',
    'A recent boxing drama',
    'Boxing movies after 2020',
    'A boxing movie under two hours',
    'A boxing movie on Hulu',
    'A boxing movie included with Hulu',
    'A boxing movie I have not watched',
    'A boxing documentary from the last 20 years',
    'A boxing movie from the last 20 years, no documentaries',
    'A movie about a boxing trainer',
    "A women's boxing movie",
    'A boxing movie with no Stallone',
  ];
  it.each(REQUIRE_BOXING)('requires boxing: %s', (t) => {
    expect(req(t)).toBe('boxing');
  });

  it('boxing is NEVER wrestling, MMA, or martial arts', () => {
    for (const t of REQUIRE_BOXING) {
      const d = detectRequiredSubject(t);
      expect(d.required?.canonical).toBe('boxing');
      // The adjacent subjects must not be silently required.
      expect(['wrestling', 'mma', 'martial arts']).not.toContain(d.required?.canonical);
    }
  });

  it('a wrestling request requires wrestling, not boxing', () => {
    expect(req('A wrestling movie from the last twenty years')).toBe('wrestling');
  });
  it('a martial-arts request requires martial arts, not boxing', () => {
    expect(req('A martial-arts movie from the last twenty years')).toBe('martial arts');
  });
});

describe('hard-subject corpus v1 — negation excludes, never requires', () => {
  it('"a boxing movie, not wrestling" — boxing required, wrestling excluded', () => {
    const d = detectRequiredSubject('A boxing movie, not wrestling');
    expect(d.required?.canonical).toBe('boxing');
    expect(d.excluded.map((s) => s.canonical)).toContain('wrestling');
  });
  it('"a boxing movie, not martial arts" — martial arts excluded', () => {
    expect(exc('A boxing movie, not martial arts')).toContain('martial arts');
    expect(req('A boxing movie, not martial arts')).toBe('boxing');
  });
  it('"a boxing movie, not MMA" — mma excluded', () => {
    expect(exc('A boxing movie, not MMA')).toContain('mma');
    expect(req('A boxing movie, not MMA')).toBe('boxing');
  });
  it('"underdog feeling but not boxing" — NO required subject, boxing excluded', () => {
    const d = detectRequiredSubject("Something with Rocky's underdog feeling but not boxing");
    expect(d.required).toBeNull();
    expect(d.excluded.map((s) => s.canonical)).toContain('boxing');
  });
  it('"something like Rocky from the last 20 years" — Rocky is a reference, not a boxing keyword', () => {
    // No literal boxing word → no required subject from the sentence alone; the
    // reference is handled by the similarity path, and "boxing" is not forced.
    expect(req('Something like Rocky from the last 20 years')).toBeNull();
  });
});

describe('hard-subject corpus v1 — genre co-occurrence', () => {
  it('"a recent boxing drama" flags an explicit genre (drama survives)', () => {
    expect(detectRequiredSubject('A recent boxing drama').explicitGenre).toBe(true);
  });
  it('a bare "a boxing movie" flags NO explicit genre (AI genres are dropped)', () => {
    expect(detectRequiredSubject('a boxing movie').explicitGenre).toBe(false);
  });
});
