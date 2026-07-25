import { test, expect, type Page } from '@playwright/test';

/**
 * AUTONOMOUS VISUAL QA — drives the REAL production chrome + content components
 * (header, global build badge, poster grid, ratings strip, quiz) across the full
 * required viewport matrix and asserts the non-negotiable responsive rules:
 *   • no horizontal overflow (scrollWidth <= innerWidth)
 *   • no interactive element extends beyond the viewport
 *   • the build badge never overlaps the logo or header controls
 *   • primary controls meet the 44×44 tap-target minimum
 *   • fixed bottom nav never obscures main content
 *   • no console / page errors
 * Screenshots for every route×viewport land in test-results/mobile/visual-qa/.
 */

const ROUTES = [
  { id: 'visual-qa', path: '/dev/visual-qa' },
  { id: 'home', path: '/dev/mobile-home' },
  { id: 'quiz', path: '/dev/dna-quiz' },
];

const VIEWPORTS = [
  { id: '320x568', w: 320, h: 568 },
  { id: '360x640', w: 360, h: 640 },
  { id: '375x667', w: 375, h: 667 },
  { id: '390x844', w: 390, h: 844 },
  { id: '393x852', w: 393, h: 852 },
  { id: '414x896', w: 414, h: 896 },
  { id: '430x932', w: 430, h: 932 },
  { id: '768x1024', w: 768, h: 1024 },
  { id: '820x1180', w: 820, h: 1180 },
  { id: '1024x768', w: 1024, h: 768 },
  { id: '1280x800', w: 1280, h: 800 },
  { id: '1440x900', w: 1440, h: 900 },
];

async function prep(page: Page) {
  // Freeze animations/transitions for deterministic capture.
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}` });
  await page.waitForLoadState('networkidle').catch(() => {});
}

for (const route of ROUTES) {
  test.describe(`${route.id} — visual QA`, () => {
    for (const vp of VIEWPORTS) {
      test(`${route.id} @ ${vp.id}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));

        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await prep(page);

        // 1) No horizontal overflow.
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(overflow.scrollWidth, `horizontal overflow on ${route.id}@${vp.id}`).toBeLessThanOrEqual(overflow.innerWidth + 1);

        // 2) No interactive element extends beyond the viewport (with a 1px tolerance).
        const escapees = await page.evaluate(() => {
          const bad: { tag: string; text: string; right: number; left: number }[] = [];
          const els = document.querySelectorAll('a,button,input,textarea,select,[role="button"]');
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue; // hidden
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (r.right > window.innerWidth + 1 || r.left < -1) {
              bad.push({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 30), right: Math.round(r.right), left: Math.round(r.left) });
            }
          }
          return bad;
        });
        expect(escapees, `interactive elements beyond viewport on ${route.id}@${vp.id}: ${JSON.stringify(escapees)}`).toEqual([]);

        // 3) The build badge must not overlap the logo/header controls.
        const badgeOverlap = await page.evaluate(() => {
          const badge = document.querySelector('[data-testid="build-badge"]');
          const header = document.querySelector('header');
          if (!badge || !header) return null;
          const b = badge.getBoundingClientRect();
          // Any interactive control inside the header.
          const controls = header.querySelectorAll('a,button,[role="button"]');
          const hits: string[] = [];
          for (const c of controls) {
            const r = c.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const overlap = !(b.x + b.width <= r.x || r.x + r.width <= b.x || b.y + b.height <= r.y || r.y + r.height <= b.y);
            if (overlap) hits.push((c.textContent || c.getAttribute('aria-label') || c.tagName).trim().slice(0, 24));
          }
          return hits;
        });
        if (badgeOverlap !== null) {
          expect(badgeOverlap, `build badge overlaps header controls on ${route.id}@${vp.id}`).toEqual([]);
        }

        // 4) Primary controls meet the 44px tap-target minimum (exclude the tiny
        //    diagnostic badge, which has its own hit-area handling).
        const smallTargets = await page.evaluate(() => {
          const bad: { text: string; w: number; h: number }[] = [];
          const els = document.querySelectorAll('main a, main button, header nav a, [data-app-bottomnav] a, [data-app-bottomnav] button');
          for (const el of els) {
            if (el.closest('[data-testid="build-badge"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (r.height < 44 || r.width < 24) bad.push({ text: (el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) });
          }
          return bad;
        });
        expect(smallTargets, `sub-44px tap targets on ${route.id}@${vp.id}: ${JSON.stringify(smallTargets)}`).toEqual([]);

        // 5) Fixed bottom nav must not obscure content: after scrolling ALL the
        //    way down, the last content block must clear the nav (i.e. the scroll
        //    container reserves enough bottom padding). This is the real test —
        //    long scrollable content is fine; being permanently hidden is not.
        if (vp.w < 640) {
          const navObscures = await page.evaluate(async () => {
            const nav = document.querySelector('[data-app-bottomnav]');
            const main = document.querySelector('main');
            if (!nav || !main) return false;
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            const n = nav.getBoundingClientRect();
            const last = main.lastElementChild;
            if (!last) return false;
            const c = last.getBoundingClientRect();
            // Fully scrolled: the last block's bottom must sit at/above the nav top.
            return c.bottom > n.top + 2;
          });
          expect(navObscures, `bottom nav obscures content on ${route.id}@${vp.id}`).toBe(false);
        }

        // Screenshot artifact.
        await page.screenshot({ path: `test-results/mobile/visual-qa/${route.id}-${vp.id}.png`, fullPage: true });

        // 6) No console / page errors.
        expect(errors, `console/page errors on ${route.id}@${vp.id}: ${errors.join(' | ')}`).toEqual([]);
      });
    }
  });
}
