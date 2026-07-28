/**
 * A TILE HAS AN EDGE YOU CAN SEE.
 *
 * The premium-surface pass swapped every result card's border for a one-pixel
 * ring at 7% white. On a near-black fill that is invisible, and a phone column
 * of tall cards — poster, synopsis, two reasons, a score, three buttons — read
 * as one continuous scroll with no boundary between one title and the next.
 * You could not tell which card a button belonged to.
 *
 * `.wv-tile` is the fix, and it has to hold in two places at once: defined in
 * ONE stylesheet rule (not re-invented per grid), and applied by EVERY grid
 * that renders result tiles. A grid that misses it is exactly the defect
 * coming back on one surface.
 *
 * Source-level because these grids need a session to render — a browser test
 * would assert against the login page and prove nothing. The pixels are
 * checked separately, against the real component, in `tests/mobile/tile-edge`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Every grid that draws a result tile. Adding a grid means adding it here. */
const TILE_GRIDS = [
  'src/components/PosterCard.tsx',
  'src/components/WatchNowGrid.tsx',
  'src/components/ReleaseWall.tsx',
  'src/components/OnTvGuide.tsx',
  'src/components/RecommendationSlate.tsx',
];

describe('the tile edge is defined once', () => {
  const css = read('src/app/globals.css');

  it('exists as a shared class, not five inline copies', () => {
    expect(css).toContain('.wv-tile {');
  });

  it('is declared AFTER .card, which it overrides', () => {
    // Same specificity — source order is the whole mechanism. If `.wv-tile`
    // moved above `.card`, every tile would silently go back to a 10% white
    // border and this fix would be undone with no test failing anywhere else.
    expect(css.indexOf('.wv-tile {')).toBeGreaterThan(css.indexOf('.card {'));
  });

  it('draws the boundary in the brand blue, not more white', () => {
    const rule = css.slice(css.indexOf('.wv-tile {'));
    // brand-400 (#4f86ff) as rgb triplet.
    expect(rule).toMatch(/border-color:\s*rgb\(79 134 255/);
  });

  it('keeps the edge readable at a real alpha', () => {
    const alpha = /border-color:\s*rgb\(79 134 255 \/ ([\d.]+)\)/.exec(
      css.slice(css.indexOf('.wv-tile {')),
    )?.[1];
    expect(alpha, 'no border-color alpha found').toBeDefined();
    // 7% white was what made it invisible. Anything in that range is the bug.
    expect(Number(alpha)).toBeGreaterThanOrEqual(0.4);
  });
});

describe('every result grid uses it', () => {
  it.each(TILE_GRIDS)('%s puts wv-tile on its tile root', (f) => {
    expect(read(f)).toMatch(/className="[^"]*\bwv-tile\b/);
  });

  it.each(TILE_GRIDS)('%s keeps the .card hook alongside it', (f) => {
    // Five components locate a placard with `closest('.card')` to fade it out.
    // `wv-tile` styles the edge; it does not replace that hook.
    expect(read(f)).toMatch(/className="[^"]*\bcard\b[^"]*\bwv-tile\b/);
  });

  it.each(TILE_GRIDS)('%s no longer hides the edge behind a hairline ring', (f) => {
    expect(read(f), 'the invisible 7% ring is back').not.toContain('ring-white/[0.07]');
    // `!border-transparent` was how the ring version killed `.card`'s border.
    // With `.wv-tile` drawing the border, that override would erase it again.
    expect(read(f)).not.toContain('!border-transparent');
  });
});
