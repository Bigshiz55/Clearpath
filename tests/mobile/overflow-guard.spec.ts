import { test, expect, type Page } from '@playwright/test';

/**
 * PERMANENT HORIZONTAL-OVERFLOW GUARD.
 *
 * Visits every renderable route at the five mandated device sizes, in BOTH
 * portrait and landscape, and fails if document.documentElement.scrollWidth
 * exceeds window.innerWidth by even 1px. On failure it lists the exact offending
 * elements (tag + classes + geometry) so a regression is diagnosed instantly,
 * not just flagged. This is the build-failing net that keeps horizontal scroll
 * from ever returning to any screen.
 *
 * Note: authenticated /app/* routes redirect to /login without a Supabase
 * session, so they are exercised through the dev harnesses (which render the
 * REAL header, cards, ratings, quiz and search components) plus every public
 * route. That is the maximum surface renderable from the repository.
 */

const ROUTES = [
  '/', '/login', '/onboarding', '/start', '/begin', '/fresh', '/learn', '/lite', '/newuser', '/offline',
  '/dev/mobile-home', '/dev/dna-quiz', '/dev/visual-qa', '/dev/logo', '/dev/search-qa',
];

// The five mandated sizes; each is run portrait AND landscape (swapped).
const DEVICES = [
  { id: 'iphone-se', w: 375, h: 667 },
  { id: 'iphone-16-pro', w: 393, h: 852 },
  { id: 'ipad', w: 820, h: 1180 },
  { id: 'laptop-1366', w: 1366, h: 768 },
  { id: 'desktop-1920', w: 1920, h: 1080 },
];

async function offenders(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: { tag: string; cls: string; right: number; width: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 0.5 || r.width > vw + 0.5) {
        out.push({ tag: el.tagName, cls: (el.getAttribute('class') || '').slice(0, 70), right: Math.round(r.right), width: Math.round(r.width) });
      }
    }
    return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: out.slice(0, 15) };
  });
}

for (const route of ROUTES) {
  for (const dev of DEVICES) {
    for (const orient of ['portrait', 'landscape'] as const) {
      const w = orient === 'portrait' ? dev.w : dev.h;
      const h = orient === 'portrait' ? dev.h : dev.w;
      test(`no h-overflow: ${route} @ ${dev.id} ${orient} (${w}×${h})`, async ({ page }) => {
        const resp = await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => null);
        // A route that doesn't render (404) is out of scope for the overflow guard.
        if (resp && resp.status() >= 400) test.skip(true, `${route} → ${resp.status()}`);
        await page.setViewportSize({ width: w, height: h });
        await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
        await page.waitForLoadState('networkidle').catch(() => {});
        const data = await offenders(page);
        expect(
          data.scrollWidth,
          `horizontal overflow on ${route} @ ${dev.id} ${orient}: scrollWidth ${data.scrollWidth} > innerWidth ${data.vw}. Offenders: ${JSON.stringify(data.offenders)}`,
        ).toBeLessThanOrEqual(data.vw);
      });
    }
  }
}
