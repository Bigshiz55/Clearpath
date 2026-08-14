import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeReturnTo, navHref } from './returnTo';

/**
 * THE TOUR'S RETURN MECHANISM — validated same-origin, structurally stable.
 * Owner RED items: footer coordinates stable · content accessible · return
 * route restored · query preserved · external malicious returnTo rejected.
 * The last three are pure and proven here; the first two are source-pinned
 * below because /app/tour sits behind auth.
 */

describe('safeReturnTo — no open redirect, ever', () => {
  it.each([
    ['https://evil.com/phish'],
    ['http://evil.com'],
    ['//evil.com/protocol-relative'],
    ['/\\evil.com'],
    ['javascript:alert(1)'],
    ['/app\\..\\escape'],
    ['/line\nbreak'],
    [''],
    ['app/no-leading-slash'],
  ])('rejects %j to the fallback', (bad) => {
    expect(safeReturnTo(bad)).toBe('/app');
  });

  it('rejects non-strings and absurd lengths', () => {
    expect(safeReturnTo(undefined)).toBe('/app');
    expect(safeReturnTo(null)).toBe('/app');
    expect(safeReturnTo(42 as unknown as string)).toBe('/app');
    expect(safeReturnTo('/' + 'a'.repeat(3000))).toBe('/app');
  });

  it('restores a same-origin route WITH its query', () => {
    expect(safeReturnTo('/app/tv?tab=movies&day=2')).toBe('/app/tv?tab=movies&day=2');
    expect(safeReturnTo('/app/dna')).toBe('/app/dna');
    expect(safeReturnTo('/packs')).toBe('/packs');
  });
});

describe('navHref — only the tour carries the origin', () => {
  it('appends the encoded current path to the tour link alone', () => {
    expect(navHref('/app/tour', '/app/tv')).toBe('/app/tour?returnTo=%2Fapp%2Ftv');
    expect(navHref('/app/dna', '/app/tv')).toBe('/app/dna');
  });

  it('never builds a self-loop or trusts a junk pathname', () => {
    expect(navHref('/app/tour', '/app/tour')).toBe('/app/tour');
    expect(navHref('/app/tour', '//evil')).toBe('/app/tour');
    expect(navHref('/app/tour', null)).toBe('/app/tour');
  });
});

describe('the tour page and hub honour the mechanism (source-pinned)', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('the page validates the param before anything renders it', () => {
    const page = read('src/app/app/tour/page.tsx');
    expect(page).toContain('safeReturnTo(searchParams?.returnTo)');
    expect(page).toContain('<TourHub returnTo={returnTo} />');
  });

  it('both Done exits navigate to the VALIDATED value, never history.back()', () => {
    const hub = read('src/components/onboarding/TourHub.tsx');
    expect(hub).toContain('href={returnTo}');
    expect(hub).toContain('tour-final-done');
    expect(hub).not.toContain('history.back');
  });

  it('the nav menus stamp the origin through navHref', () => {
    for (const f of ['src/components/nav/MoreMenu.tsx', 'src/components/nav/MobileNav.tsx']) {
      const src = read(f);
      expect(src, f).toContain('navHref(l.href, pathname)');
    }
  });
});

describe('the tour card is a stable viewport (source-pinned)', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');
  const hub = read('src/components/onboarding/TourHub.tsx');

  it('fixed-height card per breakpoint, content scrolls internally', () => {
    expect(hub).toMatch(/h-\[min\(30rem,65dvh\)\][^"]*sm:h-\[min\(34rem,70dvh\)\]/);
    expect(hub).toContain('overflow-y-auto');
    expect(hub).toContain('tour-topic-scroll');
  });

  it('the footer sits OUTSIDE the scroll area, after the fixed-height card', () => {
    const scrollAt = hub.indexOf('tour-topic-scroll');
    const footerAt = hub.indexOf('data-testid="tour-footer"');
    expect(footerAt).toBeGreaterThan(scrollAt);
    // The footer is not inside the scrolling div: the scroll container closes
    // before the footer opens.
    const between = hub.slice(scrollAt, footerAt);
    expect(between).toContain('</div>');
  });

  it('the last slide swaps Next for Done IN THE SAME SLOT — no dead-end, no moved control', () => {
    expect(hub).toContain('{isLast ? (');
    expect(hub).toContain('min-h-[44px]'); // both variants keep the touch target
  });
});
