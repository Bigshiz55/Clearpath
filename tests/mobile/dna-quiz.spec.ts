import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Cinematic ONE-TILE discovery quiz (drives /dev/dna-quiz — the REAL DnaQuiz in
 * a faithful app-shell facsimile). Proves: one-tile at every phone→ultrawide
 * size (no scroll, no overflow, four EQUAL buttons, poster + title visible),
 * the interruption-free flow, the intent mapping (Looks Good doesn't save; the
 * does; Skip is negative; Seen It → rating), and the live Watch-DNA meter.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const TARGETS = [
  { w: 320, h: 568 }, { w: 375, h: 667 }, { w: 390, h: 844 }, { w: 430, h: 932 },
  { w: 768, h: 1024 }, { w: 834, h: 1112 },
  { w: 1024, h: 768 }, { w: 1280, h: 800 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 },
];
const LANDSCAPE = [{ w: 667, h: 375 }, { w: 844, h: 390 }, { w: 932, h: 430 }];
const ACT_IDS = ['act-looks-good', 'act-skip', 'act-seen'] as const;

async function box(page: Page, testid: string) {
  const b = await page.getByTestId(testid).first().boundingBox();
  if (!b) throw new Error(`no box for ${testid}`);
  return b;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('dna-quiz')).toBeVisible();
});

// ── Intent semantics + interruption-free flow ───────────────────────────────

test('(intent) Looks Good = interest, does NOT save, advances at once', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'interested' });
  expect(subs[0]!.watchlist ?? false).toBeFalsy();
});

test('HARD: the quiz has exactly THREE actions and no Save', async ({ page }) => {
  // The quiz teaches us taste; the Watchlist stores intent. Save mixed the two,
  // and a tap meant to inform us silently created a watchlist row.
  await expect(page.getByTestId('act-save')).toHaveCount(0);
  await expect(page.getByTestId('quiz-grid').getByRole('button')).toHaveCount(3);
  const grid = await page.getByTestId('quiz-grid').innerText();
  expect(grid).not.toMatch(/save/i);
  expect(grid).not.toMatch(/bookmark|watchlist/i);
});

test('HARD: no quiz action ever writes to the watchlist', async ({ page }) => {
  for (const id of ACT_IDS) {
    if (id === 'act-seen') continue; // opens the rating step instead
    await page.getByTestId(id).click();
  }
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length).toBeGreaterThan(0);
  for (const s of subs) expect(s.watchlist ?? false).toBeFalsy();
});

test('the intro modal explains three actions, with no leftover gap', async ({ page }) => {
  await page.reload();
  const intro = page.getByTestId('quiz-intro');
  if (await intro.count()) {
    const text = await intro.innerText();
    expect(text).not.toMatch(/\bSave\b/);
    // The defensive parenthetical goes with it.
    expect(text).not.toMatch(/won.t save it/i);
    for (const a of ['Looks Good', 'Skip', 'Seen It']) expect(text).toContain(a);
  }
});

test('(intent) Skip records a negative signal and advances', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-skip').click();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'not_interested' });
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
});

test('(intent) Seen It opens the rating step; a rating records Experience + advances', async ({ page }) => {
  await expect(page.getByTestId('rating-step')).toHaveCount(0);
  await page.getByTestId('act-seen').click();
  await expect(page.getByTestId('rating-step')).toBeVisible();
  for (const g of ['rate-loved', 'rate-liked', 'rate-okay', 'rate-disliked']) await expect(page.getByTestId(g)).toBeVisible();
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-grid')).toBeVisible();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'seen', rating: 'loved' });
});

test('(no-interrupt) no modal/chip/reason prompt appears between cards', async ({ page }) => {
  await page.getByTestId('act-looks-good').click();
  await page.getByTestId('act-skip').click();
  await page.getByTestId('act-seen').click();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-grid')).toBeVisible();
  await expect(page.getByTestId('quiz-intro')).toHaveCount(0);
  await expect(page.getByTestId('rating-step')).toHaveCount(0);
  await expect(page.getByText(/why|what made|held it back/i)).toHaveCount(0);
});

test('(dna) the confidence meter rises as titles are rated', async ({ page }) => {
  const before = await page.getByTestId('dna-confidence').innerText();
  await page.getByTestId('act-looks-good').click();
  await page.getByTestId('act-skip').click();
  await expect(page.getByTestId('dna-confidence')).not.toHaveText(before);
});

test('(cinematic) a blurred backdrop is rendered behind the card', async ({ page }) => {
  expect(await page.locator('.wv-cine-bg').count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator('.wv-cine-scrim').count()).toBe(1);
});

test('(flow) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('act-skip').dblclick();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length).toBe(1);
});

test('(flow) Undo restores the previous title', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-title')).toHaveText(title0);
});

test('(a11y) the three actions + Undo have accessible names', async ({ page }) => {
  for (const label of ['Looks Good', 'Skip', 'Seen It']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
});

// ── One-tile viewport proof, phone → ultrawide ──────────────────────────────

for (const { w, h } of TARGETS) {
  test(`(one-tile) ${w}×${h} — poster + title + 3 equal buttons, no scroll, no overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    const doc = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }));
    expect(doc.sh, `no vertical scroll @ ${w}×${h}`).toBeLessThanOrEqual(doc.ch + 1);
    expect(doc.sw, `no horizontal overflow @ ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    for (const id of ['quiz-poster', 'quiz-title'] as const) {
      const b = await box(page, id);
      expect(b.height, `${id} has height @ ${w}×${h}`).toBeGreaterThan(0);
      expect(b.y + b.height, `${id} within viewport @ ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }

    const mobile = w < 640;
    const navTop = mobile ? (await box(page, 'mock-bottomnav')).y : h;
    const boxes = [] as { w: number; h: number; x: number; y: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height), x: b.x, y: b.y });
      expect(b.height, `${id} ≥48px @ ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.x, `${id} left in-bounds`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${id} right in-bounds @ ${w}×${h}`).toBeLessThanOrEqual(w + 1);
      expect(b.y + b.height, `${id} above nav / in viewport @ ${w}×${h}`).toBeLessThanOrEqual(navTop + 1);
    }
    const widths = boxes.map((b) => b.w); const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ ${w}×${h}`).toBeLessThanOrEqual(1);
    // THREE actions sit on ONE row at every width. The old assertion encoded
    // the 2×2 grid that existed only because there were four buttons.
    expect(new Set(boxes.map((b) => Math.round(b.y))).size, `1 row @ ${w}×${h}`).toBe(1);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${w}x${h}.png`), fullPage: false });
  });
}

// ── Landscape degrades gracefully ───────────────────────────────────────────

for (const { w, h } of LANDSCAPE) {
  test(`(landscape) ${w}×${h} — four equal buttons on screen, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();
    const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(doc.sw).toBeLessThanOrEqual(doc.cw + 1);
    const boxes = [] as { w: number; h: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height) });
      expect(b.height).toBeGreaterThanOrEqual(48);
      expect(b.y + b.height, `${id} visible @ landscape ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }
    expect(Math.max(...boxes.map((b) => b.w)) - Math.min(...boxes.map((b) => b.w))).toBeLessThanOrEqual(1);
    expect(Math.max(...boxes.map((b) => b.h)) - Math.min(...boxes.map((b) => b.h))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-landscape-${w}x${h}.png`), fullPage: false });
  });
}


/**
 * The action row must never be overlapped by the title block.
 *
 * Found by inspecting the rendered screenshot rather than by an assertion: at
 * 320px the title wraps to two lines, and with the poster holding an 18dvh
 * floor the metadata line ended up UNDERNEATH the buttons. Every prior layout
 * test passed — none of them checked for collision, only for overflow.
 */
for (const w of [320, 360, 375, 390, 430]) {
  test(`(layout) nothing overlaps the action row @${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 568 });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    const collision = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="quiz-grid"]')!;
      const g = grid.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .filter((el) => el.children.length === 0 && (el.innerText ?? '').trim() && !grid.contains(el))
        .map((el) => ({ t: (el.innerText ?? '').trim().slice(0, 24), r: el.getBoundingClientRect() }))
        .filter(({ r }) =>
          Math.min(g.right, r.right) - Math.max(g.left, r.left) > 2 &&
          Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top) > 2)
        .map((x) => x.t);
    });
    expect(collision, `overlapping the buttons @${w}`).toEqual([]);
  });
}

/**
 * The rating row has FOUR options and the action row has THREE.
 *
 * They shared one grid class, so narrowing the action row to three columns
 * silently narrowed this one too — orphaning "Didn't Like It" onto its own line
 * and wrapping its label. Different arities, different grids.
 */
for (const [label, w, h] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  test(`(layout) the rating row is balanced @${label}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await page.getByTestId('act-seen').click();
    await expect(page.getByTestId('rating-step')).toBeVisible();

    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="rate-"]'))
        .filter((el) => el.dataset.testid !== 'rate-back')
        .map((el) => { const r = el.getBoundingClientRect();
          return { y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                   wrapped: el.scrollHeight > el.clientHeight + 1 }; }));

    expect(boxes).toHaveLength(4);
    // No orphan: four items divide evenly into whole rows (4×1 or 2×2).
    const rows = new Map<number, number>();
    for (const b of boxes) rows.set(b.y, (rows.get(b.y) ?? 0) + 1);
    const perRow = [...rows.values()];
    expect(new Set(perRow).size, `uneven rows @${label}: ${perRow.join('/')}`).toBe(1);

    // Equal size, and no label clipped by its own button.
    const ws = boxes.map((b) => b.w);
    expect(Math.max(...ws) - Math.min(...ws), `equal widths @${label}`).toBeLessThanOrEqual(1);
    for (const b of boxes) expect(b.wrapped, `label clipped @${label}`).toBe(false);
  });
}
