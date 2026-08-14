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
      const cta = document.querySelector('[data-testid="open-invite"]') as HTMLElement;
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

test('MODE SELECTION COMES BEFORE CREATION — the owner-stated hierarchy', async ({ page }) => {
  await open(page, 1440, 900);
  // The question leads, and there is NO generic pre-mode create button left:
  // a room cannot exist before someone says what kind of verdict this is.
  await expect(page.getByTestId('verdict-mode-question')).toContainText('What kind of verdict are you running?');
  await expect(page.getByTestId('start-court')).toHaveCount(0);
  // The two modes, named as modes, each with its explicit start action.
  await expect(page.getByTestId('together-secondary')).toBeVisible();
  await expect(page.getByTestId('open-device')).toContainText('Quick Pick');
  await expect(page.getByTestId('open-device')).toContainText('Start Quick Pick');
  await expect(page.getByTestId('open-invite')).toContainText('Jury Room');
  await expect(page.getByTestId('open-invite')).toContainText('Start Jury Room');
  // Jury Room is the door that opens a live room with a code to share.
  await expect(page.getByTestId('open-invite')).toContainText('code to share');
  // Crews are reachable — as a rail now, not a lone underlined link.
  await expect(page.getByTestId('crew-rail')).toBeVisible();
  await expect(page.getByTestId('open-crews')).toBeVisible();
});

test('Quick Pick never invokes the invitation flow — no room, no code', async ({ page }) => {
  await open(page, 1440, 900);
  // Creating a live room is an RPC; if Quick Pick reached it, the harness
  // (which has no session) would surface the error alert. It must not:
  // Quick Pick discloses the on-device planner in place and nothing else.
  await page.getByTestId('open-device').click();
  await expect(page.getByText('Quick, private juries stored just on this phone', { exact: false })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(page.url()).not.toContain('/court/');
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
  const ids = ['open-device', 'open-invite', 'open-crews'];
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
  for (const id of ['open-device', 'open-invite', 'open-crews']) {
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
  await expect(page.getByTestId('open-invite')).toBeVisible();
  await expect(page.getByTestId('crew-rail')).toBeVisible();
  const durations = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '.wv-vr-enter, .wv-vr-drift, .wv-vr-ready, .wv-vr-pulse, .wv-vr-react, .wv-vr-consensus, .wv-vr-sheen > span',
      ),
    ].map((el) => getComputedStyle(el).animationDuration),
  );
  expect(durations.length, 'no animated elements found — the selector list is stale').toBeGreaterThan(0);
  for (const d of durations) expect(parseFloat(d)).toBeLessThan(0.01);
  // The room is still DRESSED, not merely still: a reduced-motion visitor gets
  // the same composition, not a set of elements frozen mid-reveal.
  await expect(page.getByTestId('shadow-poster')).toHaveCount(3);
  await expect(page.getByTestId('shadow-decision')).toBeAttached();
  await page.screenshot({ path: 'test-results/mobile/verdict-room-reduced-motion.png' });
});

/**
 * WHAT THE ROOM IS MADE OF.
 *
 * The first version of this composition was two blank gradient rectangles, a
 * row of anonymous dots and a generic bar — legible as a wireframe rather than
 * as a room. These assertions are the floor under the replacement: the plates
 * carry drawn artwork, the people are people and at least one of them has
 * reacted, and the room has a moment where it decides.
 */
test('the shadow room is dressed, not a wireframe', async ({ page }) => {
  await open(page, 1440, 900);

  const posters = page.getByTestId('shadow-poster');
  await expect(posters).toHaveCount(3);
  // Each plate holds an actual illustration. A blank plate would be an <svg>
  // with a background rect and nothing else, so the bar is set above that.
  const shapes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="shadow-poster"] svg')].map(
      (svg) => svg.querySelectorAll('path, circle, rect, ellipse, line').length,
    ),
  );
  expect(shapes.length, 'a plate is missing its artwork entirely').toBe(3);
  for (const n of shapes) expect(n, `a plate has only ${n} drawn shapes`).toBeGreaterThan(8);

  // People, and at least one of them has pressed a key.
  expect(await page.getByTestId('shadow-seat').count()).toBeGreaterThanOrEqual(4);
  expect(await page.getByTestId('shadow-reaction').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('shadow-decision')).toBeAttached();
});

test('nothing in the room escapes the box it was drawn in', async ({ page }) => {
  await open(page, 1440, 900);
  // REGRESSION. `PosterArt` is `absolute inset-0`, so a container that forgets
  // `position: relative` does not clip it — it hands it the whole verdict
  // board, and a 36px thumbnail paints across 340px of panel.
  const thumb = (await page.getByTestId('shadow-board-thumb').boundingBox())!;
  expect(thumb.width, `board thumbnail is ${thumb.width}px wide`).toBeLessThan(60);

  const art = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="shadow-board-thumb"] svg')!;
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(art.w, 'the board artwork is painting outside its thumbnail').toBeLessThan(60);
});

test('the whole shortlist is on screen on a phone', async ({ page }) => {
  await open(page, 390, 844);
  // REGRESSION. `rotateY` before `translateZ` applies the depth push in the
  // ROTATED frame, which adds z·sin(θ) of sideways travel — enough to hang
  // both flanking plates off the edges of a 390px screen as slivers.
  const boxes = await page.getByTestId('shadow-poster').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) };
    }),
  );
  expect(boxes).toHaveLength(3);
  for (const b of boxes) {
    expect(b.left, `a plate starts at ${b.left}px`).toBeGreaterThanOrEqual(-8);
    expect(b.right, `a plate ends at ${b.right}px in a 390px screen`).toBeLessThanOrEqual(398);
    expect(b.w, `a plate is only ${b.w}px wide — too small to read as a poster`).toBeGreaterThan(55);
  }
});

test('the empty crew state is designed, not an apology', async ({ page }) => {
  await open(page, 1440, 900);
  // The harness has no session, so `listCrews()` returns "not signed in" —
  // which from the visitor's side is the same true sentence as "no crews yet".
  await expect(page.getByTestId('crew-rail-empty')).toBeVisible();
  await expect(page.getByTestId('crew-rail-empty')).toContainText('No crews yet');
});
