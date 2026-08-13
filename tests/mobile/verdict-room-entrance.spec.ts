import { test, expect, type Page } from '@playwright/test';

/**
 * THE VERDICT ROOM ENTRANCE.
 *
 * The screen was a 576px column — heading, one blue rectangle, two identical
 * cards, an underlined crews link — floating at the top of a black page. It
 * told a first-time visitor nothing about what happens after the click.
 *
 * These assertions pin the replacement, and they are about COMPOSITION rather
 * than decoration: the stage actually fills the viewport, the shadow room is
 * really behind the controls, the two modes are genuinely distinct, and every
 * behaviour the old screen had still works and is still reachable by keyboard.
 */
const WIDTHS = [
  { w: 1440, h: 900, name: 'desktop-1440' },
  { w: 1280, h: 800, name: 'desktop-1280' },
  { w: 834, h: 1112, name: 'tablet-834' },
  { w: 390, h: 844, name: 'mobile-390' },
];

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/**', (r) => r.fulfill({ json: {} }));
  await page.goto('/dev/together', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('verdict-room-entrance')).toBeVisible();
  // The staged entrance runs ~620ms plus per-element delay.
  await page.waitForTimeout(1200);
}

for (const { w, h, name } of WIDTHS) {
  test(`${name}: the stage owns the viewport and the room sits behind it`, async ({ page }) => {
    await open(page, w, h);

    const stage = page.locator('section[aria-labelledby="verdict-room-title"]');
    const box = (await stage.boundingBox())!;
    // THE VOID IS GONE. The old screen used roughly the top quarter; the stage
    // now covers the overwhelming majority of the viewport height.
    expect(box.height / h, `stage covers ${(box.height / h) * 100}% of the viewport`).toBeGreaterThan(0.82);
    // EDGE TO EDGE. The stage deliberately breaks the shell's max-w cap, so a
    // wide screen gets a room rather than a large card with black bands down
    // both sides. It must reach the viewport's own width, and it must do so
    // without producing the horizontal scrollbar that a naive 100vw causes
    // (asserted at the end of this test).
    expect(box.width, `stage is ${box.width}px in a ${w}px viewport`).toBeGreaterThanOrEqual(w - 1);

    // The shadow room is present, decorative, and BEHIND the controls.
    const shadow = page.getByTestId('shadow-room');
    await expect(shadow).toBeAttached();
    await expect(shadow).toHaveAttribute('aria-hidden', 'true');
    const layering = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="shadow-room"]') as HTMLElement;
      const cta = document.querySelector('[data-testid="start-court"]') as HTMLElement;
      return { shadowEvents: getComputedStyle(s).pointerEvents, ctaZ: getComputedStyle(cta.closest('div.relative.z-10')!).zIndex };
    });
    // Atmosphere must never eat a click meant for the room.
    expect(layering.shadowEvents).toBe('none');
    expect(Number(layering.ctaZ)).toBeGreaterThan(0);

    await page.screenshot({ path: `test-results/mobile/verdict-room-after-${name}.png` });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}

test('the entrance keeps every behaviour the old screen had', async ({ page }) => {
  await open(page, 1440, 900);
  // The primary action, by the id the rest of the suite drives.
  const cta = page.getByTestId('start-court');
  await expect(cta).toBeVisible();
  await expect(cta).toContainText('Start a Verdict Room');
  // Both modes, still distinct controls, still present.
  await expect(page.getByTestId('together-secondary')).toBeVisible();
  await expect(page.getByTestId('open-device')).toBeVisible();
  await expect(page.getByTestId('open-invite')).toBeVisible();
  // Crews are reachable — as a rail now, not a lone underlined link.
  await expect(page.getByTestId('crew-rail')).toBeVisible();
  await expect(page.getByTestId('open-crews')).toBeVisible();
});

test('Quick Pick still discloses the on-device planner in place', async ({ page }) => {
  await open(page, 1440, 900);
  await page.getByTestId('open-device').click();
  await expect(page.getByText('Quick, private juries stored just on this phone', { exact: false })).toBeVisible();
});

test('the two modes are visually distinct, not two of the same card', async ({ page }) => {
  await open(page, 1440, 900);
  const tone = (id: string) =>
    page.getByTestId(id).evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopColor, bg: s.backgroundImage };
    });
  const here = await tone('open-device');
  const apart = await tone('open-invite');
  expect(here.border).not.toBe(apart.border);
  expect(here.bg).not.toBe(apart.bg);
});

test('every control is keyboard reachable with a visible focus ring', async ({ page }) => {
  await open(page, 1440, 900);
  const ids = ['start-court', 'open-device', 'open-invite', 'open-crews'];
  for (const id of ids) {
    await page.getByTestId(id).focus();
    const focused = await page.evaluate((t) => document.activeElement?.getAttribute('data-testid'), id);
    expect(focused, `${id} cannot take focus`).toBe(id);
    const ring = await page.getByTestId(id).evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-ring-color'));
    expect(ring, `${id} has no focus ring colour`).not.toBe('');
  }
});

test('touch targets clear 44px on a phone', async ({ page }) => {
  await open(page, 390, 844);
  for (const id of ['start-court', 'open-device', 'open-invite', 'open-crews']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.height, `${id} is ${b.height}px tall`).toBeGreaterThanOrEqual(44);
  }
});

test('reduced motion leaves a still, complete composition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 1440, 900);
  // Nothing is mid-animation and nothing is left invisible by an entrance
  // that never ran — the staged reveal must not be load-bearing.
  await expect(page.getByRole('heading', { name: 'The Verdict Room' })).toBeVisible();
  await expect(page.getByTestId('start-court')).toBeVisible();
  await expect(page.getByTestId('crew-rail')).toBeVisible();
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('.wv-vr-enter, .wv-vr-drift, .wv-vr-ready, .wv-vr-pulse')].map(
      (el) => getComputedStyle(el).animationDuration,
    ),
  );
  for (const d of durations) expect(parseFloat(d)).toBeLessThan(0.01);
  await page.screenshot({ path: 'test-results/mobile/verdict-room-reduced-motion.png' });
});

test('the empty crew state is designed, not an apology', async ({ page }) => {
  await open(page, 1440, 900);
  // The harness has no session, so `listCrews()` returns "not signed in" —
  // which from the visitor's side is the same true sentence as "no crews yet".
  await expect(page.getByTestId('crew-rail-empty')).toBeVisible();
  await expect(page.getByTestId('crew-rail-empty')).toContainText('No crews yet');
});
