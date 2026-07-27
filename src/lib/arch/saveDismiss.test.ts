/**
 * SAVED MEANS HANDLED.
 *
 * A browsing grid is a set of things you have not decided about yet. Once a
 * title is on your watchlist you HAVE decided, so leaving the card sitting
 * there — with the button now reading "Saved" — makes the grid a list of
 * decisions you already made, and every scroll past it is wasted attention.
 *
 * Two exceptions, both deliberate:
 *   • A grid that IS somebody's list (a friend's profile) keeps its cards. A
 *     card vanishing there would read as editing their list.
 *   • Removal never happens on un-save. `hideCard` is only reachable from the
 *     add branch.
 *
 * Source-level because these grids need a session to render, so a browser test
 * would assert against a login page and prove nothing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('SaveButton', () => {
  it('removes the card only after a successful add, never on removal', () => {
    const src = read('src/components/SaveButton.tsx');
    const addBranch = src.slice(src.indexOf('addToWatchlist('), src.indexOf('} finally'));
    expect(addBranch).toContain('hideCard()');

    const removeBranch = src.slice(src.indexOf('removeWatchlistItem('), src.indexOf('addToWatchlist('));
    expect(removeBranch).not.toContain('hideCard');
  });

  it('lets the grid drop the row itself rather than only hiding the DOM node', () => {
    const src = read('src/components/SaveButton.tsx');
    expect(src).toContain('onRemove');
    expect(src).toContain('if (onRemove) onRemove();');
    // An onRemove caller should not also have to remember removeOnSave.
    expect(src).toContain('if (removeOnSave || onRemove) hideCard();');
  });

  it('leaves a beat before the card goes, so the bookmark fill registers', () => {
    const src = read('src/components/SaveButton.tsx');
    const hide = src.slice(src.indexOf('function hideCard'), src.indexOf('async function toggle'));
    expect(hide).toMatch(/setTimeout\([\s\S]*?, 450\)/);
  });
});

describe('the card fade hook', () => {
  it('every placard keeps the `card` class the fade depends on', () => {
    // Five components find the placard with closest('.card'). Restyling the
    // card by replacing its classes — rather than overriding them — silently
    // breaks all five, and nothing about the page looks wrong afterwards.
    const src = read('src/components/PosterCard.tsx');
    expect(src).toMatch(/className="card /);

    for (const f of [
      'src/components/SaveButton.tsx',
      'src/components/TasteFeedback.tsx',
      'src/components/LikeButton.tsx',
    ]) {
      expect(read(f), f).toContain("closest('.card')");
    }
  });
});

/**
 * ONE CARD SHAPE, NOT THREE COPIES OF IT.
 *
 * PosterCard was turned into a row on phones so more than one title fits a
 * screen. The New Releases wall hand-rolls its OWN card, kept the full-bleed
 * poster, and so still filled the entire screen with a single title — the exact
 * bug, still live, on a surface nobody thought to check.
 *
 * The shape now lives once, in globals.css. These pin that every card grid uses
 * it rather than restating the classes, because a fourth copy is how this
 * happens again.
 */
/**
 * THE VERDICT PAIR.
 *
 * The red button is labelled AGAINST, not "Pass". `not_for_me` is weight 0.8
 * and PERMANENT; `not_now` is weight 0.4 with mood decay. "Pass" reads as "skip
 * / not tonight" — it describes `not_now` — so putting it on the button that
 * writes `not_for_me` invites someone to record a durable judgement while
 * thinking they deferred. The accessible name keeps the full phrase.
 */
describe('the FOR / AGAINST pair', () => {
  it('labels the red button AGAINST rather than a deferral word', () => {
    const src = read('src/components/TasteFeedback.tsx');
    expect(src).toMatch(/>Against</);
    for (const deferral of ['>Pass<', '>Skip<', '>Later<', '>Not now<']) {
      expect(src, deferral).not.toContain(deferral);
    }
  });

  it('keeps the full meaning in the accessible name, not only the visible word', () => {
    const src = read('src/components/TasteFeedback.tsx');
    expect(src).toContain('aria-label="Not for me — teaches your Viewer DNA"');
    expect(src).toMatch(/title="Not for me[^"]*teaches your Viewer DNA/);
  });

  it('pairs it with a one-word green FOR, so neither side is longer', () => {
    expect(read('src/components/LikeButton.tsx')).toMatch(/>For</);
  });
});

describe('the shared card shape', () => {
  const SHAPE = ['.wv-card', '.wv-card-art', '.wv-card-body'];

  it('is defined exactly once, in the stylesheet', () => {
    const css = read('src/app/globals.css');
    for (const cls of SHAPE) expect(css, cls).toContain(`${cls} {`);
  });

  it('every card grid uses the shared classes', () => {
    for (const f of ['src/components/PosterCard.tsx', 'src/components/ReleaseWall.tsx']) {
      const src = read(f);
      expect(src, `${f} wv-card`).toMatch(/className="[^"]*\bwv-card\b/);
      expect(src, `${f} wv-card-art`).toContain('wv-card-art');
      expect(src, `${f} wv-card-body`).toContain('wv-card-body');
    }
  });

  it('no card grid restates the row layout inline', () => {
    // A full-width `aspect-[2/3]` poster is the old shape. If one reappears in
    // a card grid, that grid has drifted off the shared definition.
    for (const f of ['src/components/PosterCard.tsx', 'src/components/ReleaseWall.tsx']) {
      expect(read(f), f).not.toMatch(/aspect-\[2\/3\]\s+w-full/);
    }
  });
});

describe('the browsing grids', () => {
  it('every placard dismisses on save by default', () => {
    const src = read('src/components/PosterCard.tsx');
    expect(src).toContain('dismissOnSave = true');
    expect(src).toContain('removeOnSave={dismissOnSave}');
  });

  it('the New Releases wall drops the row from its own state', () => {
    const src = read('src/components/ReleaseWall.tsx');
    const save = src.slice(src.indexOf('<SaveButton'), src.indexOf('<TasteFeedback'));
    expect(save).toContain('onRemove');
  });

  it('every hand-rolled SaveButton in a suggestion grid opts in', () => {
    // A grid that supplies its own overlay bypasses PosterCard's default, so
    // each one has to say so itself. These are the suggestion surfaces.
    for (const file of [
      'src/app/app/watch/page.tsx',
      'src/components/Mentalist.tsx',
      'src/components/RecommendedForYou.tsx',
    ]) {
      const src = read(file);
      const buttons = src.match(/<SaveButton[\s\S]*?\/>/g) ?? [];
      expect(buttons.length, file).toBeGreaterThan(0);
      for (const b of buttons) expect(b, `${file}: ${b.slice(0, 60)}`).toContain('removeOnSave');
    }
  });

  it("a friend's profile keeps its cards — that list is theirs, not a feed", () => {
    const src = read('src/app/app/u/[username]/page.tsx');
    const buttons = src.match(/<SaveButton[\s\S]*?\/>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).not.toContain('removeOnSave');
  });
});
