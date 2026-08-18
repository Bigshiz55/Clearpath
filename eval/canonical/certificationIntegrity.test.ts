import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { interpret } from '@/lib/interpret/interpret';
import { EMPTY_INTENT, type CanonicalIntent } from '@/lib/interpret/types';
import { naiveParseQuery } from '@/lib/finderParse';
import { violations, type FrozenCase } from './check';

/**
 * DOES THE CERTIFICATION ACTUALLY CERTIFY ANYTHING?
 *
 * A suite that only ever runs the correct implementation cannot tell you it
 * would notice an incorrect one — every assertion passes, and passing proves
 * nothing about sensitivity. Adversarial review asked for the inverse
 * evidence, so this file sabotages the interpreter on purpose and proves the
 * failures appear, then proves the legacy parser cannot satisfy the same bar
 * however much it improves.
 *
 * `naiveParseQuery` is imported HERE deliberately — this is the one file whose
 * job is to demonstrate what it cannot do. The certification suite next door
 * still refuses to import it, and asserts as much about itself.
 */

const CASES: FrozenCase[] = JSON.parse(
  fs.readFileSync(path.resolve('eval/gold/regression.frozen.json'), 'utf8'),
) as FrozenCase[];

/** Each mutant is one canonical repair, deleted. */
const MUTANTS: Record<string, (i: CanonicalIntent) => CanonicalIntent> = {
  'media ownership removed': (i) => ({ ...i, media: 'either' }),
  'relative dates removed': (i) => ({ ...i, date: { ...i.date, lookback: undefined } }),
  'count ownership removed': (i) => ({ ...i, requestedCount: null }),
  'person ownership removed': (i) => ({ ...i, people: [] }),
  'provider ownership removed': (i) => ({ ...i, providers: [] }),
  'interpreter resolves a year itself': (i) => ({ ...i, date: { ...i.date, minYear: 2021 } }),
  'everything removed': () => ({ ...EMPTY_INTENT, kind: 'recommendation' }),
};

describe('the certification would CATCH a deletion of the canonical fixes', () => {
  for (const [name, mutate] of Object.entries(MUTANTS)) {
    it(`detects: ${name}`, () => {
      const caught = CASES.filter((c) => violations(mutate(interpret(c.rawQuery)), c.canonical ?? {}).length > 0);
      expect(caught.length, `mutant "${name}" slipped past every frozen case`).toBeGreaterThan(0);
    });
  }

  it('and the UNMUTATED interpreter passes every one of them', () => {
    // The control. Without it, the block above would also pass if the
    // predicate simply rejected everything.
    const failing = CASES.filter((c) => violations(interpret(c.rawQuery), c.canonical ?? {}).length > 0);
    expect(failing.map((c) => c.id)).toEqual([]);
  });

  it('every frozen family is covered by at least one mutant', () => {
    /* A mutant that no case can catch is a repair nothing protects. */
    const byFamily = new Map<string, boolean>();
    for (const c of CASES) byFamily.set(c.archetype, false);
    for (const mutate of Object.values(MUTANTS)) {
      for (const c of CASES) {
        if (violations(mutate(interpret(c.rawQuery)), c.canonical ?? {}).length > 0) byFamily.set(c.archetype, true);
      }
    }
    expect([...byFamily.entries()].filter(([, covered]) => !covered).map(([f]) => f)).toEqual([]);
  });
});

describe('LEGACY PARSER IMPROVEMENTS CANNOT MAKE CERTIFICATION PASS', () => {
  it('naiveParseQuery cannot express a relative window at all', () => {
    /* The structural argument, not a behavioural one: certification asserts on
       `CanonicalIntent.date.lookback`, and the legacy query object has no field
       of that meaning. No amount of improving the legacy parser can populate a
       field it does not have — so a green certification is evidence about the
       canonical owner and nothing else. */
    const legacy = naiveParseQuery('movies from the last 5 years') as unknown as Record<string, unknown>;
    expect(Object.keys(legacy)).not.toContain('lookback');
    expect(interpret('movies from the last 5 years').date.lookback).toEqual({
      amount: 5,
      unit: 'year',
      direction: 'past',
    });
  });

  it('nor a credit ROLE — the director/actor distinction has nowhere to live', () => {
    const legacy = naiveParseQuery('movies directed by Clint Eastwood') as unknown as Record<string, unknown>;
    expect(Object.keys(legacy)).not.toContain('people');
    expect(interpret('movies directed by Clint Eastwood').people[0]?.role).toBe('director');
  });

  it('the certification suite does not import the legacy parser', () => {
    const src = fs.readFileSync(path.resolve('eval/canonical/certification.test.ts'), 'utf8');
    expect(src).not.toContain('finderParse');
  });
});

describe('the frozen corpus actually reaches CI', () => {
  it('regression.frozen.json is tracked by git, not a local-only artifact', () => {
    /* The previous home (`eval/gold/regression.json`) is an OUTPUT and is
       git-ignored, so a case "frozen" there would never reach a CI runner.
       This asserts the file is genuinely versioned. */
    const tracked = execFileSync('git', ['ls-files', 'eval/gold/regression.frozen.json'], {
      encoding: 'utf8',
    }).trim();
    expect(tracked).toBe('eval/gold/regression.frozen.json');
  });

  it('the canonical suites are inside the root vitest include, so `vitest run` covers them', () => {
    const cfg = fs.readFileSync(path.resolve('vitest.config.ts'), 'utf8');
    expect(cfg).toContain('eval/**/*.test.ts');
  });

  it('CI runs the unit suite that contains them', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/vitest run/);
  });
});
