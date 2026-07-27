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
