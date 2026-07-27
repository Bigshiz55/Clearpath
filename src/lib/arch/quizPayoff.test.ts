/**
 * EVERY QUIZ ENDS SOMEWHERE.
 *
 * You finish Rapid Fire, it tells you it recorded 24 real opinions, and the
 * only button on the screen is "Keep going". The one moment somebody has just
 * taught the recommender something was the moment the app gave them nowhere to
 * go and see what it did.
 *
 * There were four completion screens and four different answers: two offered a
 * route to recommendations under two different names, and two offered none at
 * all. The reward for finishing depended on which route you took to get there.
 * (The statements quiz was one of the four; it has since been removed.)
 *
 * One button now, same words, PRIMARY on every one — with a single deliberate
 * exception, below.
 *
 * Source-level because these screens are mid-flow states behind a session; a
 * browser test would assert against a login page.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every screen that can say "you're done". */
const COMPLETION_SCREENS = [
  'src/components/RapidFire.tsx',
  'src/components/DnaQuiz.tsx',
  'src/components/TitleGridCalibration.tsx',
];

describe('the payoff button', () => {
  it('is on every completion screen', () => {
    for (const f of COMPLETION_SCREENS) {
      expect(read(f), `${f} dead-ends`).toContain('SeeRecommendations');
    }
  });

  it('is one component, so the wording cannot drift again', () => {
    const cta = read('src/components/SeeRecommendations.tsx');
    expect(cta).toContain('See my recommendations');
    // The old second name. Two buttons for one action is how this started.
    for (const f of COMPLETION_SCREENS) {
      expect(read(f), `${f} restates the label`).not.toContain('Find something to watch →');
    }
  });

  it('lands where the recommendations actually are', () => {
    expect(read('src/components/SeeRecommendations.tsx')).toContain("RECOMMENDATIONS_HREF = '/app/watch'");
    // That route must not serve a cached page, or the button arrives at picks
    // built before the answers that earned it.
    expect(read('src/app/app/watch/page.tsx')).toContain("export const dynamic = 'force-dynamic'");
  });

  it('outranks "keep going" — finishing is the default, repeating is the option', () => {
    // The title grid always shows the payoff, so its "keep going" is never
    // primary. It used to be the only primary button on the screen.
    const grid = read('src/components/TitleGridCalibration.tsx');
    const gridKeepGoing = grid.slice(grid.indexOf('Keep going') - 700, grid.indexOf('Keep going'));
    expect(gridKeepGoing, 'the title grid still leads with "keep going"').not.toContain('btn-primary');

    // Rapid Fire is the one screen where "keep going" MAY lead — in the demo,
    // where there is no payoff button beside it because nothing was saved. The
    // rule is that the two are never primary at once.
    const rapid = read('src/components/RapidFire.tsx');
    const rapidKeepGoing = rapid.slice(rapid.indexOf('Keep going') - 700, rapid.indexOf('Keep going'));
    expect(rapidKeepGoing).toMatch(/savesToDna \? '' : 'btn-primary/);
  });

  it('never claims a count the run did not produce', () => {
    const cta = read('src/components/SeeRecommendations.tsx');
    // `taught` is optional and only rendered when it is a positive number.
    expect(cta).toMatch(/taught && taught > 0/);
  });
});

/**
 * THE EXCEPTION, AND WHY IT IS ONE.
 *
 * The Rapid Fire demo runs on invented data and writes nothing. Offering "see
 * my recommendations" as the reward for finishing it would point at a screen
 * that cannot reflect a single thing you just did.
 */
describe('the demo does not offer a payoff it cannot deliver', () => {
  it('Rapid Fire knows whether the run reaches the DNA', () => {
    expect(read('src/components/RapidFire.tsx')).toContain('savesToDna');
  });

  it('and the demo says it does not', () => {
    expect(read('src/components/RapidFireDemo.tsx')).toContain('savesToDna={false}');
  });

  it('the demo still has a real next step — importing, which does count', () => {
    expect(read('src/components/RapidFireDemo.tsx')).toContain('/import-taste');
  });
});
