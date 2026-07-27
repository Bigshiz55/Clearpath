/**
 * THE FIXED BOTTOM LAYERS.
 *
 * The bottom nav and the docket tray are `position: fixed`. On a real iPhone
 * both were observed sitting in the MIDDLE of the screen, over a poster, while
 * measuring perfectly flush with the bottom in Chromium — so the layout was
 * never wrong, the compositing was.
 *
 * Two well-known iOS Safari triggers were present and are now both gone:
 *   • `backdrop-filter` on a fixed element. Safari repaints that layer lazily
 *     and can leave it at a stale scroll offset.
 *   • `background-attachment: fixed` on the body, which forces the whole page
 *     onto that same fragile compositing path.
 *
 * This cannot be caught by a browser test — headless Chromium renders it
 * correctly, which is the entire problem — so it is pinned at the source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** The className of the fixed wrapper in a component, by its marker. */
function fixedWrapper(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `marker ${marker} not found`).toBeGreaterThan(-1);
  const from = src.lastIndexOf('<div', at);
  return src.slice(from, src.indexOf('>', at) + 1);
}

describe('the bottom nav', () => {
  const src = read('src/components/nav/MobileNav.tsx');

  it('is welded to the bottom edge, not floated inset from it', () => {
    const wrapper = fixedWrapper(src, 'data-app-bottomnav');
    expect(wrapper).toContain('fixed');
    expect(wrapper).toContain('bottom-0');
    // An inset (px-*) wrapper is what let content show through beside it.
    expect(wrapper).not.toMatch(/\bpx-\d/);
    // The safe area becomes padding on an edge-anchored bar, not an offset.
    expect(wrapper).toContain('pb-[env(safe-area-inset-bottom)]');
  });

  it('carries no backdrop-filter anywhere — the sheet scrim included', () => {
    expect(src).not.toContain('backdrop-blur');
  });

  it('has an opaque background', () => {
    const wrapper = fixedWrapper(src, 'data-app-bottomnav');
    // bg-ink-950 is opaque; bg-ink-900/90 was not. (The sheet scrim above is
    // deliberately translucent — it is a scrim, and it is not this element.)
    expect(wrapper).toMatch(/bg-ink-950\b/);
    expect(wrapper).not.toMatch(/bg-[\w-]+\/\d/);
  });
});

describe('the docket tray', () => {
  it('is opaque and unblurred for the same reason', () => {
    const src = read('src/components/DocketTray.tsx');
    expect(src).not.toContain('backdrop-blur');
    expect(src).not.toMatch(/bg-ink-950\/\d/);
  });
});

describe('the page background', () => {
  it('does not use background-attachment: fixed', () => {
    // Strip comments first: the note explaining why it is gone says the words.
    const css = read('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/background-attachment:\s*fixed/);
  });
});
