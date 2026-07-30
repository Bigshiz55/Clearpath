/**
 * THE GRID DOES NOT MOVE UNDER YOUR THUMB.
 *
 * Every action on a card used to remove it: Save faded the placard out, FOR and
 * AGAINST did the same. Removing a cell collapses it, so every card after it
 * jumped up a slot mid-scan — and a decision you could not see was a decision
 * you could not take back.
 *
 * The rule now: NOTHING REMOVES A CARD. Each control shows its own state in
 * place and can be tapped again to reverse it. Titles you have handled are
 * filtered out of the picks server-side, so they are gone on the NEXT load —
 * which is the right split. Within a session a ruling is revisitable; between
 * sessions it is something you told the recommender.
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
  it('never removes the card — the Saved state IS the undo', () => {
    const src = read('src/components/SaveButton.tsx');
    // The fade-and-vanish machinery, and the props that reached it, are gone.
    expect(src).not.toContain('hideCard');
    expect(src).not.toContain('removeOnSave');
    expect(src).not.toMatch(/display\s*=\s*'none'/);
  });

  it('saving is reversible on the spot', () => {
    const src = read('src/components/SaveButton.tsx');
    // Tapping a saved button takes the title back off the list. That only
    // helps while the card is still there to tap.
    expect(src).toContain('removeWatchlistItem(itemId)');
    expect(src).toMatch(/saved \? 'Saved' : 'Save'/);
  });
});

describe('the card class', () => {
  it('every placard keeps the `card` class components anchor to', () => {
    // CardVerdict finds the placard with closest('.card') to centre its burst.
    // Restyling the card by REPLACING its classes rather than overriding them
    // breaks that silently, and nothing about the page looks wrong afterwards.
    expect(read('src/components/PosterCard.tsx')).toMatch(/className="card /);
    expect(read('src/components/CardVerdict.tsx')).toContain("closest('.card')");
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
  it('labels the red side AGAINST rather than a deferral word', () => {
    const src = read('src/lib/verdict/cardRuling.ts');
    expect(src).toMatch(/against:\s*'Against'/);
    for (const deferral of ["'Pass'", "'Skip'", "'Later'", "'Not now'"]) {
      expect(src, deferral).not.toContain(deferral);
    }
  });

  it('keeps the full meaning in the accessible name, not only the visible word', () => {
    const src = read('src/lib/verdict/cardRuling.ts');
    expect(src).toMatch(/teaches your Viewer DNA/);
  });

  it('pairs it with a one-word FOR, so neither side is longer', () => {
    expect(read('src/lib/verdict/cardRuling.ts')).toMatch(/for:\s*'For'/);
  });
});

describe('the shared card shape', () => {
  const SHAPE = ['.wv-card', '.wv-card-art', '.wv-card-body'];

  it('is defined exactly once, in the stylesheet', () => {
    const css = read('src/app/globals.css');
    for (const cls of SHAPE) expect(css, cls).toContain(`${cls} {`);
  });

  // The On TV highlight strip was the THIRD copy of a card layout, and it broke
  // the same way the New Releases wall did: hand-rolled, it drew two columns on
  // a phone with an action row ~157px wide, which is 48px a button for a word
  // that measures 57. That is what "iPhone view" was a picture of.
  const CARD_GRIDS = [
    'src/components/PosterCard.tsx',
    'src/components/ReleaseWall.tsx',
    'src/components/OnTvGuide.tsx',
  ];

  it('every card grid uses the shared classes', () => {
    for (const f of CARD_GRIDS) {
      const src = read(f);
      expect(src, `${f} wv-card`).toMatch(/className="[^"]*\bwv-card\b/);
      expect(src, `${f} wv-card-art`).toContain('wv-card-art');
      expect(src, `${f} wv-card-body`).toContain('wv-card-body');
    }
  });

  it('no card grid restates the row layout inline', () => {
    // A full-width `aspect-[2/3]` poster is the old shape. If one reappears in
    // a card grid, that grid has drifted off the shared definition.
    for (const f of CARD_GRIDS) {
      expect(read(f), f).not.toMatch(/aspect-\[2\/3\]\s+w-full/);
    }
  });

  it('and none of them lays out its own columns on a phone', () => {
    // `grid-cols-2` with no breakpoint is the specific mistake: two 170px cells
    // on a 390px screen, which is narrower than the controls they have to hold.
    for (const f of CARD_GRIDS) {
      expect(read(f), `${f} hand-rolls a phone grid`).not.toMatch(/className="[^"]*\bgrid-cols-[234]\b/);
    }
  });
});

/**
 * A BUTTON IS NEVER NARROWER THAN THE WORD ON IT.
 *
 * Every action row in the app hand-rolled its own flex, and they were all wrong
 * the same way: `flex-1 min-w-0`. A flex item with `min-width: 0` is allowed to
 * shrink BELOW ITS OWN CONTENT, so in a narrow card the buttons kept dividing
 * the space evenly and let "AGAINST" render outside its own border. Measured at
 * 320px on the main poster grid — not only on the TV strip — and 9px past the
 * border in the two-up strip that was screenshotted.
 */
describe('the action row', () => {
  const css = read('src/app/globals.css');

  it('has one definition, and it is a container', () => {
    expect(css).toContain('.wv-act-row {');
    // A viewport media query answers the wrong question here: the same row is
    // ~334px wide in a single column and ~157px in a two-up strip on the SAME
    // phone. The row has to measure itself.
    expect(css).toMatch(/\.wv-act-row \{[\s\S]{0,200}container-type: inline-size/);
    expect(css).toMatch(/@container[\s\S]{0,120}\.wv-act-icon \{[\s\S]{0,40}display: none/);
  });

  it('gives every control a floor of its own content', () => {
    expect(css).toMatch(/\.wv-act \{[\s\S]{0,120}min-width: fit-content/);
  });

  it('and no control opts back out with min-w-0', () => {
    for (const f of ['src/components/CardVerdict.tsx', 'src/components/SaveButton.tsx']) {
      const src = read(f);
      const rows = src.split('\n').filter((l) => l.includes('wv-act') && l.includes('min-w-0'));
      expect(rows, `${f} still shrinks a control below its label`).toEqual([]);
    }
  });

  it('is used by every grid that shows the verdict pair', () => {
    for (const f of [
      'src/components/PosterCard.tsx',
      'src/components/ReleaseWall.tsx',
      'src/components/WatchNowGrid.tsx',
      'src/components/OnTvGuide.tsx',
    ]) {
      expect(read(f), `${f} hand-rolls the action row`).toContain('wv-act-row');
    }
  });
});

describe('no grid pulls a card out from under you', () => {
  const GRIDS = [
    'src/components/PosterCard.tsx',
    'src/components/ReleaseWall.tsx',
    'src/components/WatchNowGrid.tsx',
    'src/components/OnTvGuide.tsx',
    'src/components/Mentalist.tsx',
    'src/components/HomeRecommendations.tsx',
    'src/app/app/watch/page.tsx',
  ];

  it('no card grid asks for a card to be dismissed', () => {
    for (const f of GRIDS) {
      const src = read(f);
      expect(src, `${f} removeOnSave`).not.toContain('removeOnSave');
      expect(src, `${f} dismissOnSave`).not.toContain('dismissOnSave');
    }
  });

  it('no grid hides a ruled card from its own state either', () => {
    // Filtering the list by a `hidden` set is the same reflow by another route.
    for (const f of ['src/components/ReleaseWall.tsx', 'src/components/WatchNowGrid.tsx', 'src/components/OnTvGuide.tsx']) {
      expect(read(f), f).not.toMatch(/setHidden\(/);
    }
  });

  it('the verdict pair is the single component every grid uses', () => {
    // Two independent buttons could not agree on what the card said, which is
    // why neither could offer an undo.
    for (const f of GRIDS) {
      const src = read(f);
      expect(src, `${f} TasteFeedback`).not.toContain('<TasteFeedback');
      expect(src, `${f} LikeButton`).not.toContain('<LikeButton');
    }
  });
});

describe('a ruling can be taken back', () => {
  const src = read('src/components/CardVerdict.tsx');

  it('the ruled button is itself the undo, and really retracts the signal', () => {
    expect(src).toContain('nextRuling(');
    expect(src).toContain('isUndo(');
    // Not just a visual reset — the recorded feedback is withdrawn.
    expect(src).toContain('undoPassFeedback');
  });

  it('nothing about a ruling changes the card\'s size', () => {
    // A visible status line under the action row cost 42px and pushed every
    // card below it down the page. The ruling rides on the button instead.
    expect(src).toContain('sr-only');
    expect(src).not.toMatch(/basis-full/);
  });

  it('a failed write does not leave the card claiming it succeeded', () => {
    expect(src).toMatch(/catch[\s\S]{0,120}setRuling\(ruling\)/);
  });
});
