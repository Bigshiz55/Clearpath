import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * THE INTERIOR IS THE SAME ROOM AS THE ENTRANCE.
 *
 * PR #58 rebuilt the door. Behind it, `CourtRoom` was still
 * `<main className="container-page max-w-2xl">` with five identical
 * `rounded-2xl border border-white/10 bg-white/[0.03]` cards stacked inside it —
 * so walking in downgraded the product, which is worse than never having built
 * the entrance, because it makes the entrance read as marketing.
 *
 * These are the properties that stop that happening again. They are deliberately
 * about the ROOM rather than about any one stage's copy: that the ground is
 * there, that the room says where it has got to, that you can see who else is in
 * it from every stage, and that none of it costs a tap target or a line of
 * legibility at 320px.
 *
 * The engine is not tested here — `court.spec.ts` owns that, and this pass
 * changed none of it.
 */

const HARNESS = '/dev/court';
const SHOTS = 'test-results/verdict-room-interior';
const HOST_TOKEN = 'host-token-abcdefgh';
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 720 };

interface RoomModel {
  status: 'lobby' | 'veto' | 'verdict';
  participants: {
    id: string; name: string; host?: boolean; ready?: boolean;
    pickCount?: number; reactionCount?: number;
    reactions?: Record<string, { r: string; reason?: string }>;
  }[];
  finalists: unknown[] | null;
  messages: { id: string; sender: string; body: string; at: string }[];
  courtSize?: 'quick' | 'standard' | 'deep';
  hostName?: string | null;
  sizeLocked?: boolean;
}

function finalist(rank: number, id: number, title: string, fits: [string, number][], streaming = ['Netflix']) {
  return {
    rank, id, mediaType: 'movie', title, year: 2019, posterUrl: null,
    attributes: ['Mystery'], genres: ['Mystery'],
    perMember: fits.map(([name, score]) => ({ name, score, picked: false })),
    pickedBy: [], fit: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    minScore: Math.min(...fits.map((f) => f[1])), avgScore: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    streaming,
  };
}

async function mockRoom(page: Page, initial: RoomModel) {
  const room: RoomModel = JSON.parse(JSON.stringify(initial));
  await page.route(/\/rest\/v1\/rpc\//, async (route) => {
    const fn = route.request().url().split('/rpc/')[1]!.split('?')[0]!;
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    if (fn === 'court_state_v2' || fn === 'court_state') {
      const host = room.participants.find((p) => p.host);
      return route.fulfill({
        json: {
          ...room,
          courtSize: room.courtSize ?? 'standard',
          hostName: room.hostName ?? host?.name ?? null,
          sizeLocked: room.sizeLocked ?? room.status !== 'lobby',
        },
        headers: { 'content-type': 'application/json' },
      });
    }
    if (fn === 'court_join') {
      room.participants.push({ id: `p-${room.participants.length + 1}`, name: String(body.p_name ?? 'Guest') });
      return route.fulfill({ json: [{ participant_id: `p-${room.participants.length}` }] });
    }
    return route.fulfill({ json: null });
  });
  return room;
}

const PEOPLE = [
  { id: 'p-1', name: 'Scott', host: true, ready: true, pickCount: 3, reactionCount: 3 },
  { id: 'p-2', name: 'Amy', ready: true, pickCount: 2, reactionCount: 3 },
  { id: 'p-3', name: 'Heather', ready: false, pickCount: 1, reactionCount: 0 },
];
const FINALISTS = [
  finalist(1, 101, 'The Long Walk Home', [['Scott', 88], ['Amy', 74], ['Heather', 91]]),
  finalist(2, 102, 'Nightshift', [['Scott', 70], ['Amy', 82], ['Heather', 65]]),
  finalist(3, 103, 'A Quiet Kind of Ruin', [['Scott', 61], ['Amy', 58], ['Heather', 77]], []),
];

/** Arrive as a participant who is already in the room. */
async function asMember(page: Page) {
  await page.addInitScript((t) => localStorage.setItem('court_host_HARNESS1', t), HOST_TOKEN);
  await page.addInitScript(() => localStorage.setItem('court_part_HARNESS1', 'p-1'));
}

async function overflowX(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Product controls only — the dev harness's build badge is not one. */
/**
 * Screenshot only once the staged entrance has finished.
 *
 * The panels arrive on a 70ms step capped at six, on top of a 460ms animation,
 * so a frame grabbed on the first paint catches half the room mid-fade — which
 * is a true picture of one moment and a useless one for review. Waiting is not
 * papering over a slow screen: the content is present and interactive
 * throughout; only its opacity is still resolving.
 */
async function settled(page: Page) {
  await page.waitForTimeout(1100);
}

async function underTouchMinimum(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll('main button, main a[href], main input'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44) bad.push(`${el.tagName}:${(el.textContent || '').trim().slice(0, 28)}=${Math.round(r.height)}`);
    }
    return bad;
  });
}

test.use({ viewport: PHONE });

test.describe('the room has a floor, and it is the same room at every stage', () => {
  test('the atmosphere is present on JOIN, REACT and VERDICT alike', async ({ page }) => {
    /* THE REGRESSION THIS CATCHES is the easy one to reintroduce: a stage added
       later that returns its own markup instead of going through the shell, and
       lands the user back on flat black halfway through a session. */
    await mockRoom(page, { status: 'lobby', participants: [{ id: 'p-1', name: 'Scott', host: true }], finalists: null, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-join')).toBeVisible();
    await expect(page.getByTestId('room-atmosphere')).toBeAttached();

    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-react')).toBeVisible();
    await expect(page.getByTestId('room-atmosphere')).toBeAttached();

    await mockRoom(page, { status: 'verdict', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await expect(page.getByTestId('room-atmosphere')).toBeAttached();
  });

  test('a closed room is still reported INSIDE the room', async ({ page }) => {
    // An error screen that throws away the surrounding place reads as the app
    // breaking, when what happened is that a session ended — which is normal.
    await page.route(/\/rest\/v1\/rpc\//, (r) =>
      r.fulfill({ json: null, headers: { 'content-type': 'application/json' } }),
    );
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-not-found')).toBeVisible();
    await expect(page.getByTestId('room-atmosphere')).toBeAttached();
    await expect(page.getByTestId('room-rail')).toBeVisible();
  });
});

test.describe('the room says where it has got to', () => {
  test('the rail lights the stage the ROOM is in, not a step this device counted', async ({ page }) => {
    /* A LATE JOINER IS THE WHOLE POINT. Somebody opening the link while the
       others are already reacting must be shown the room's real position. A
       counter kept per-device would show them the beginning. */
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-react')).toBeVisible();

    const current = page.locator('[data-testid="room-rail-node"][data-state="current"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute('data-stage', 'react');
    // Everything before it is finished, everything after it is still ahead.
    await expect(page.locator('[data-testid="room-rail-node"][data-state="done"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="room-rail-node"][data-state="ahead"]')).toHaveCount(1);
  });

  test('and it reaches VERDICT when the room does', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'verdict', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await expect(page.locator('[data-testid="room-rail-node"][data-state="current"]')).toHaveAttribute('data-stage', 'verdict');
    await expect(page.locator('[data-testid="room-rail-node"][data-state="ahead"]')).toHaveCount(0);
  });

  test('the current step is announced as one, so the rail is not visual-only', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-react')).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Room progress' })).toBeVisible();
  });
});

test.describe('you can see who else is in the room, from anywhere in it', () => {
  test('presence rides the header through REACT and VERDICT', async ({ page }) => {
    /* Presence used to live only on the JOIN screen and inside the lobby's group
       panel, so from the shortlist onward the room silently emptied — four
       people deciding together, and no evidence of the other three. */
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-react')).toBeVisible();
    await expect(page.getByTestId('room-presence-face')).toHaveCount(3);
    // Ready is drawn from the room's own participant rows, never assumed.
    await expect(page.locator('[data-testid="room-presence-face"][data-ready="1"]')).toHaveCount(2);

    await mockRoom(page, { status: 'verdict', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await expect(page.getByTestId('room-presence-face')).toHaveCount(3);
  });

  test('an empty room shows no faces rather than a placeholder', async ({ page }) => {
    await mockRoom(page, { status: 'lobby', participants: [], finalists: null, messages: [] });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-join')).toBeVisible();
    await expect(page.getByTestId('room-presence')).toHaveCount(0);
  });

  test('the room code is readable without leaving the room', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('room-code')).toHaveText('HARNESS1');
  });
});

test.describe('candidates are presented, not listed', () => {
  test('the group score is a length as well as a number, and it is the engine’s', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-react')).toBeVisible();

    const bars = page.getByTestId('group-match-bar');
    await expect(bars).toHaveCount(3);
    // Widths must be ordered the same way the engine ordered the candidates —
    // a bar that disagrees with the ranking is worse than no bar.
    const widths = await bars.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    expect(widths[0]!).toBeGreaterThan(widths[1]!);
    expect(widths[1]!).toBeGreaterThan(widths[2]!);
    // And the number the bar is drawn from is the one the engine computed.
    const scores = await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-score'))));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('exactly one candidate is lit as leading, and a vetoed one never is', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.locator('[data-testid="react-card"][data-leading="1"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="react-card"]').first()).toHaveAttribute('data-leading', '1');
  });

  test('the three reaction keys are three different answers, not one control', async ({ page }) => {
    await asMember(page);
    await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    const card = page.locator('[data-testid="react-card"]').first();
    const skins = await Promise.all(
      ['react-for', 'react-maybe', 'react-pass'].map((id) =>
        card.getByTestId(id).evaluate((el) => {
          const cs = getComputedStyle(el);
          return `${cs.borderTopColor}|${cs.backgroundColor}`;
        }),
      ),
    );
    expect(new Set(skins).size, 'unpressed, the three keys were three identical grey rectangles').toBe(3);
  });
});

test.describe('atmosphere never costs legibility, a tap target, or a line', () => {
  for (const [label, size] of [['phone', PHONE], ['narrow', NARROW]] as const) {
    test(`no horizontal overflow and no undersized control at ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await asMember(page);
      await mockRoom(page, { status: 'veto', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
      await page.goto(HARNESS);
      await expect(page.getByTestId('court-react')).toBeVisible();
      expect(await overflowX(page), 'the room must never scroll sideways').toBe(0);
      expect(await underTouchMinimum(page)).toEqual([]);
      await settled(page);
      await page.screenshot({ path: path.join(SHOTS, `react-${label}.png`), fullPage: true });
    });
  }

  test('the lobby’s mood chips clear the touch minimum', async ({ page }) => {
    // Measured at 36px before this pass — the most-tapped controls in the room,
    // and the only ones in the app under the minimum.
    await mockRoom(page, { status: 'lobby', participants: [{ id: 'p-1', name: 'Scott', host: true }], finalists: null, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await page.getByPlaceholder('Your name').fill('Scott');
    await page.getByTestId('join-court').click();
    await expect(page.getByTestId('court-tonight')).toBeVisible();
    expect(await underTouchMinimum(page)).toEqual([]);
    await settled(page);
    await page.screenshot({ path: path.join(SHOTS, 'lobby-phone.png'), fullPage: true });
  });

  test('reduced motion leaves a still, COMPLETE room rather than an empty one', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await asMember(page);
    await mockRoom(page, { status: 'verdict', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    // The verdict resolves on the first frame under reduced motion, so the
    // headline is the title and not "Tallying the votes…".
    await expect(page.getByTestId('verdict-headline')).toContainText('The Long Walk Home');
    await expect(page.getByTestId('room-atmosphere')).toBeAttached();
    /* COLLAPSED, NOT REMOVED. The global reduced-motion rule rewrites every
       duration to 1e-06s rather than to 0s, which is deliberate — a zero
       duration cancels `animation-fill-mode: both` on some engines and the
       element never reaches its end state at all. So the assertion is "nothing
       is still moving perceptibly", measured in milliseconds, the same way the
       entrance suite states it. */
    const slow = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="room-atmosphere"] *'))
        .map((el) => getComputedStyle(el).animationDuration)
        .filter((d) => parseFloat(d) > 0.01),
    );
    expect(slow, 'every ambient animation should be collapsed below 10ms').toEqual([]);
    await settled(page);
    await page.screenshot({ path: path.join(SHOTS, 'verdict-reduced-motion.png'), fullPage: true });
  });
});

test.describe('the evening has somewhere to go after the verdict', () => {
  test('both continuations are reachable from the screen the room ends on', async ({ page }) => {
    /* The room had two of them and neither was linked from here. "Appeal" is
       the another-round path INSIDE this room and it was already on screen; a
       FRESH room lived only back at /app/together with nothing pointing at it,
       so the only way to run a second night was the browser's back button. */
    await asMember(page);
    await mockRoom(page, { status: 'verdict', participants: PEOPLE, finalists: FINALISTS, messages: [], hostName: 'Scott' });
    await page.goto(HARNESS);
    await expect(page.getByTestId('court-verdict')).toBeVisible();
    await page.waitForTimeout(2600); // the reveal sequence has to finish first

    await expect(page.getByTestId('verdict-continue')).toBeVisible();
    // Named, not "the next one" — the room knows which title is standing by.
    await expect(page.getByTestId('verdict-continue')).toContainText('Nightshift');
    await expect(page.getByTestId('verdict-new-room')).toHaveAttribute('href', '/app/together');
    await expect(page.getByTestId('appeal')).toBeVisible();
    expect(await underTouchMinimum(page)).toEqual([]);
  });
});
