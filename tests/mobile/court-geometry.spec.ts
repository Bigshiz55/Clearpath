import { test, expect, type Page } from '@playwright/test';
import { mockRoom, HARNESS, EMPTY_LOBBY, finalist, type RoomModel } from './courtRoomMock';

/**
 * THE VERDICT ROOM, MEASURED — P0-G's forensic pass.
 *
 * The FAB collision was the first thing a screenshot showed. This is the sweep
 * that does not depend on anyone noticing: at every width the room is used at,
 * in every state a juror can reach, it reads the geometry the browser actually
 * produced and asserts the four properties a control must have to BE a control.
 *
 *   1 · nothing a finger needs is smaller than the room's own 44px standard,
 *   2 · nothing that sticks out of the viewport is unreachable — a horizontal
 *       strip is fine, a clipped one is a dead button,
 *   3 · no fixed or sticky layer sits on top of an interactive control,
 *   4 · the page never scrolls sideways.
 *
 * WHAT IT FOUND. The chat's quick replies — the one place a juror types on a
 * phone — were 27px tall, against the 44px the Send button beside them already
 * used. Both off-screen strips (quick replies, the candidate tray) turned out
 * to be genuinely scrollable, so they are reported and allowed rather than
 * "fixed" by squeezing them.
 */

/** The room's own standard, set by the Send button and the FOR button. */
const TOUCH_MIN = 44;

const VIEWPORTS = [
  { name: 'phone-320', w: 320, h: 800 },
  { name: 'phone-390', w: 390, h: 844 },
  { name: 'phone-430', w: 430, h: 932 },
  { name: 'desktop-1440', w: 1440, h: 900 },
];

const VERDICT: RoomModel = {
  status: 'verdict',
  participants: [
    { id: 'p-1', name: 'Scott', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
    { id: 'p-2', name: 'Heather', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
  ],
  finalists: [
    finalist(1, 301, 'Knives Out', [['Scott', 94], ['Heather', 88]]),
    // Long content, deliberately: a title that must wrap rather than push.
    finalist(2, 302, 'A Deliberately Very Long Fixture Title That Must Wrap Cleanly', [['Scott', 80], ['Heather', 78]]),
  ],
  messages: [],
};

interface Geometry {
  overflow: number;
  tooSmall: { label: string; w: number; h: number }[];
  unreachable: { label: string; x: number; right: number }[];
  covered: { control: string; by: string }[];
}

/** Read what the browser actually laid out. No assumptions about the markup. */
async function geometryOf(page: Page, min: number): Promise<Geometry> {
  return page.evaluate((TOUCH: number) => {
    const vw = window.innerWidth;
    const visible = (el: Element) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const label = (el: Element) =>
      (el.getAttribute('data-testid') ?? (el.textContent ?? '').trim().slice(0, 28) ?? el.tagName).trim();

    const controls = Array.from(document.querySelectorAll('button, a[href], input, select, textarea')).filter(visible);

    const tooSmall: Geometry['tooSmall'] = [];
    const unreachable: Geometry['unreachable'] = [];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      // The build pill is global debug chrome, not a room control.
      if (el.closest('[data-testid="build-badge-row"]') || el.getAttribute('data-testid') === 'build-badge') continue;
      /* ROUNDED, because line-height rounding lands the room's own 44px chips
         at 43.98 and a half-pixel is not a usability finding. The repo's
         existing court assertion uses the same tolerance (`>= 43`). */
      const hw = Math.round(r.width);
      const hh = Math.round(r.height);
      if (hh < TOUCH || hw < TOUCH) tooSmall.push({ label: label(el), w: hw, h: hh });
      if (r.x < -1 || r.x + r.width > vw + 1) {
        // Sticking out is only a defect when nothing can scroll to it.
        let p: HTMLElement | null = el.parentElement;
        let reachable = false;
        while (p) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1) { reachable = true; break; }
          p = p.parentElement;
        }
        if (!reachable) unreachable.push({ label: label(el), x: Math.round(r.x), right: Math.round(r.x + r.width) });
      }
    }

    const covered: Geometry['covered'] = [];
    /* PERSISTENT CHROME ONLY. A sheet or dialog the user OPENED is supposed to
       cover the page behind it — that is what opening it means, and it carries
       its own dismiss control. What must never cover a control is chrome the
       user did not summon and cannot move: the global feedback button was
       exactly that, sitting on "Watch it". So dialogs are excluded by their own
       role attribute rather than by name, and everything else is fair game. */
    const layers = Array.from(document.querySelectorAll('*')).filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
      if (cs.pointerEvents === 'none' || !visible(el)) return false;
      return el.closest('[role="dialog"], [aria-modal="true"]') === null;
    });
    for (const layer of layers) {
      const lr = layer.getBoundingClientRect();
      for (const el of controls) {
        if (layer.contains(el) || el.contains(layer)) continue;
        // A control the open sheet owns is in front of the layer, not under it.
        if (el.closest('[role="dialog"], [aria-modal="true"]') !== null) continue;
        const r = el.getBoundingClientRect();
        const hits = r.x < lr.x + lr.width && r.x + r.width > lr.x && r.y < lr.y + lr.height && r.y + r.height > lr.y;
        if (hits) covered.push({ control: label(el), by: label(layer) });
      }
    }

    return {
      overflow: document.documentElement.scrollWidth - vw,
      tooSmall, unreachable, covered,
    };
  }, min);
}

async function assertSound(page: Page, where: string) {
  const g = await geometryOf(page, TOUCH_MIN);
  expect(g.overflow, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(g.unreachable.map((u) => u.label), `${where}: controls off-screen with nothing to scroll them into view`).toEqual([]);
  expect(g.covered.map((c) => `${c.control} under ${c.by}`), `${where}: fixed chrome on top of a control`).toEqual([]);
  expect(
    g.tooSmall.map((t) => `${t.label} ${t.w}x${t.h}`),
    `${where}: below the room's own ${TOUCH_MIN}px touch standard`,
  ).toEqual([]);
}

for (const { name, w, h } of VIEWPORTS) {
  test(`the room is sound through join → lobby → chat @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await mockRoom(page, EMPTY_LOBBY);
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-join')).toBeVisible();
    await assertSound(page, 'join');

    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    await expect(page.getByTestId('court-group')).toBeVisible();
    await assertSound(page, 'lobby');

    // The advanced disclosure is where the densest controls live.
    const advanced = page.getByTestId('advanced-toggle').first();
    if (await advanced.count()) {
      await advanced.click();
      await expect(page.getByTestId('advanced-panel').first()).toBeVisible();
      await assertSound(page, 'lobby + advanced');
    }

    /* CHAT IS A SHEET ON A PHONE AND A COLUMN ON A WIDE SCREEN. Above `xl`
       the room lays out roster · court · activity and the toggle is hidden
       because the chat is already on screen, so this opens it only where an
       opener exists and audits the same surface either way. */
    const opener = page.getByTestId('open-chat');
    if (await opener.isVisible().catch(() => false)) {
      await opener.click();
      await expect(page.getByTestId('group-chat')).toBeVisible();
      await assertSound(page, 'lobby + chat sheet');
    }
    /* …and with something typed, because the send button changes state. Above
       `xl` the third column is the ACTIVITY FEED, not a composer, so there is
       nothing to type into and nothing to audit in that state. */
    const input = page.getByTestId('chat-input').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('Works for me');
      await assertSound(page, 'lobby + chat + draft');
    }
  });

  test(`the room is sound in the verdict, with long content @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await mockRoom(page, VERDICT);
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await assertSound(page, 'verdict');

    // Appeal moves the winner: the state after a decision must hold too.
    const appeal = page.getByTestId('appeal');
    if (await appeal.count()) {
      await appeal.click();
      await expect(page.getByTestId('court-verdict')).toContainText('Deliberately Very Long');
      await assertSound(page, 'verdict after appeal');
    }
  });

  test(`the voting floor is sound @ ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/court-vote');
    await expect(page.getByTestId('voting-floor')).toBeVisible();
    await assertSound(page, 'voting floor');
  });
}
