import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * NOTHING MAY WRITE LIST STATE WITHOUT SAYING WHY.
 *
 * The contamination was not one bad line — it was that `addToWatchlist` and
 * `rateQuizTitle` could be called from anywhere with no obligation to state
 * whether the user had actually asked for anything. Fourteen call sites existed
 * and at least three of them were asserting things the user never said.
 *
 * A unit test on one function cannot prevent the fifteenth call site from
 * repeating it. So this is a SOURCE-LEVEL invariant: every writer must name its
 * provenance, checked across the whole repository, and it fails the moment
 * somebody adds a path that does not.
 *
 * Source scanning is normally a poor substitute for behavioural testing. Here it
 * is the correct tool, because the property being protected is "no future caller
 * can omit this", which is a statement about the callers rather than the callee.
 */

const IGNORE = /node_modules|\.next|dist/;

function grepCallSites(pattern: string): string[] {
  try {
    const out = execSync(`grep -rn "${pattern}" src --include=*.ts --include=*.tsx`, {
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .filter(Boolean)
      .filter((l) => !IGNORE.test(l));
  } catch {
    return [];
  }
}

/** The call, plus enough of what follows to see its arguments. */
function callArgs(file: string, line: number, span = 14): string {
  const lines = readFileSync(file, 'utf8').split('\n');
  return lines.slice(line - 1, line - 1 + span).join('\n');
}

describe('every watchlist writer states its provenance', () => {
  it('addToWatchlist is never called without one', () => {
    const sites = grepCallSites('addToWatchlist(').filter(
      (l) =>
        !l.includes('src/lib/actions/watchlist.ts') && // the definition
        !l.includes('.test.ts') &&
        !l.includes('import '),
    );
    expect(sites.length, 'no call sites found — the grep is wrong, not the code').toBeGreaterThan(5);

    const missing: string[] = [];
    for (const site of sites) {
      const [file, lineStr] = site.split(':');
      const body = callArgs(file!, Number(lineStr));
      if (!body.includes('provenance')) missing.push(`${file}:${lineStr}`);
    }
    expect(
      missing,
      'these save titles into a user list without recording why:\n' + missing.join('\n'),
    ).toEqual([]);
  });

  it('rateQuizTitle callers outside the game say so explicitly', () => {
    /* The default is `taste_game_rating` because that is where the overwhelming
       majority come from, and a forgetful caller must not be able to pass itself
       off as a deliberate user action by omission. Callers that ARE something
       else have to say so. */
    const sites = grepCallSites('rateQuizTitle(').filter(
      (l) =>
        !l.includes('src/lib/actions/quiz.ts') &&
        !l.includes('.test.ts') &&
        !l.includes('import '),
    );
    expect(sites.length).toBeGreaterThan(2);
    for (const site of sites) {
      const [file, lineStr] = site.split(':');
      const body = callArgs(file!, Number(lineStr));
      expect(
        body.includes('provenance'),
        `${file}:${lineStr} rates a title without saying what kind of claim it is`,
      ).toBe(true);
    }
  });
});

describe('the specific defects that shipped', () => {
  it('naming a film you want to AVOID no longer marks it watched', () => {
    /* `build-case` ran the avoid-list through `rateQuizTitle` at rating 2, which
       writes `status: 'watched'`. Saying "not that" asserted you had seen it.
       This one IS unambiguously wrong, unlike the game ratings — the user never
       claimed to have watched a film they asked us to keep away from them. */
    const src = readFileSync('src/app/api/build-case/route.ts', 'utf8');
    expect(src, 'avoid titles are not marked unseen').toMatch(/avoidTitles[\s\S]{0,120}false/);
    expect(src).toContain('seen');
  });

  it('the taste game still records the rating — the fix is not amnesia', () => {
    /* The ratings are real and the recommendation engine has always been seeded
       from them. The change is what the WATCHLIST claims, not what the engine
       knows. A "fix" that dropped the writes would have quietly degraded
       recommendations for everyone. */
    const src = readFileSync('src/lib/actions/quiz.ts', 'utf8');
    expect(src).toContain("from('watchlist_items')");
    expect(src).toContain('rating: v.rating');
    expect(src).toContain('taste_game_rating');
  });
});
