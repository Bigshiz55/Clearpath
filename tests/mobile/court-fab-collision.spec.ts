import { test, expect, type Page } from '@playwright/test';
import { mockRoom, HARNESS, type RoomModel } from './courtRoomMock';

/**
 * NOTHING FIXED MAY SIT ON A VOTE.
 *
 * The Verdict Room is a standalone surface with its own header and its own
 * chat: it owns the screen the way Showdown does. The global feedback FAB is
 * positioned `fixed` bottom-left against the viewport, so at phone widths it
 * lands on whatever the room happens to put there — and what the room puts
 * there is the ballot. The captured QA screenshots show it directly on top of
 * "Watch it" on the voting floor and on the quick-reply row of the open group
 * chat.
 *
 * A tap that lands on feedback when the juror meant to vote is not a cosmetic
 * problem; it is the room's primary action, silently intercepted. This measures
 * the collision rather than describing it: the FAB's rectangle may not intersect
 * any control the room renders, at any phone width, in any stage.
 */

const PHONES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
];

const LOBBY: RoomModel = {
  status: 'lobby',
  participants: [{ id: 'p-1', name: 'Scott', host: true }, { id: 'p-2', name: 'Amy' }],
  finalists: null,
  messages: [],
};

const VERDICT: RoomModel = {
  status: 'verdict',
  participants: [
    { id: 'p-1', name: 'Scott', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
    { id: 'p-2', name: 'Heather', reactionCount: 2, reactions: { 'movie-301': { r: 'for' } } },
  ],
  finalists: [
    {
      rank: 1, id: 301, mediaType: 'movie', title: 'Knives Out', year: 2019, posterUrl: null,
      attributes: ['Mystery'], genres: ['Mystery'],
      perMember: [{ name: 'Scott', score: 94, picked: false }, { name: 'Heather', score: 88, picked: false }],
      pickedBy: [], fit: 91, minScore: 88, avgScore: 91, streaming: ['Netflix'],
    },
  ],
  messages: [],
};

/** Every rectangle the room offers a finger, in the current stage. */
async function controlRects(page: Page) {
  return page.evaluate(() => {
    const out: { label: string; x: number; y: number; w: number; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll('button, a[href], input, select, textarea'))) {
      if (el.getAttribute('data-testid') === 'feedback-fab') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      out.push({
        label: (el.getAttribute('data-testid') ?? el.textContent ?? el.tagName).trim().slice(0, 40),
        x: r.x, y: r.y, w: r.width, h: r.height,
      });
    }
    return out;
  });
}

async function assertNoCollision(page: Page, stage: string) {
  const fab = page.getByTestId('feedback-fab');
  const count = await fab.count();
  if (count === 0) return; // suppressed here — nothing can collide
  const box = (await fab.boundingBox())!;
  const overlaps = (await controlRects(page)).filter(
    (r) => r.x < box.x + box.width && r.x + r.w > box.x && r.y < box.y + box.height && r.y + r.h > box.y,
  );
  expect(overlaps.map((o) => o.label), `${stage}: the feedback button covers room controls`).toEqual([]);
}

for (const { w, h } of PHONES) {
  test(`no fixed chrome lands on a room control @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });

    await mockRoom(page, LOBBY);
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    await expect(page.getByTestId('court-group')).toBeVisible();
    await assertNoCollision(page, 'lobby');

    // …and with the room's own chat open, which is where a juror types.
    await page.getByTestId('open-chat').click();
    await expect(page.getByTestId('group-chat')).toBeVisible();
    await assertNoCollision(page, 'lobby + chat');
  });

  test(`no fixed chrome lands on the verdict's actions @ ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await mockRoom(page, VERDICT);
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await assertNoCollision(page, 'verdict');
  });
}

/* THE CONTROL. Suppression must be exactly as narrow as the collision: an
   ordinary page keeps its feedback affordance. */
test('an ordinary page still offers feedback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: {}, overview: null } }));
  await page.goto('/dev/visual-qa');
  await expect(page.getByTestId('feedback-fab')).toBeVisible();
});
