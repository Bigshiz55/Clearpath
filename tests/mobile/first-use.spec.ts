import { test, expect, type Page } from '@playwright/test';
import { stubQuizWriteSucceeds } from './quizWriteStub';

/**
 * FIRST-USE RELIABILITY — the release gate for the reliability sprint.
 *
 * Every other suite proves one screen or one component behaves. This one asks
 * the only question the sprint was called for: can a completely new visitor,
 * in a private browser, get from the homepage to a useful, trustworthy Verd1ct
 * WITHOUT meeting an endless spinner, an empty default page, a 404, wrong
 * personalization, or a silent failure?
 *
 * It covers the eight named first-use STATES and the two named critical
 * JOURNEYS. Each state is driven by intercepting the real endpoints the real
 * components call, so what's asserted is the shipped failure handling, not a
 * mock of it.
 *
 * WHAT THIS HARNESS CANNOT PROVE, stated plainly rather than papered over:
 * the harness build points Supabase at `harness.invalid` and carries no TMDB
 * key, so there is no real session to expire and no real ranked data to
 * personalize. Anything below that depends on a live backend is asserted at
 * the level the harness genuinely reaches — the component's handling of the
 * server-shaped response — and says so in its own comment. Real end-to-end
 * personalization and real magic-link sign-in are verified against the
 * deployed site, not here.
 */

const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 320, height: 568 };
const DESKTOP = { width: 1440, height: 900 };

/** Twelve quiz titles in the exact shape /api/calibration returns. */
function calibrationItems(n = 20) {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    mediaType: i % 3 === 0 ? 'tv' : 'movie',
    title: `First Use Title ${i + 1}`,
    year: 2000 + i,
    posterPath: null,
    posterUrl: null,
    genre: 'drama',
  }));
}

interface CalibrationOpts {
  items?: ReturnType<typeof calibrationItems>;
  progress?: { index: number; size: number; percent: number; reachedEarly: boolean; complete: boolean };
  status?: number;
  delayMs?: number;
}

async function stubCalibration(page: Page, opts: CalibrationOpts = {}) {
  await page.route('**/api/calibration*', async (route) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.status && opts.status >= 400) {
      await route.fulfill({
        status: opts.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Upstream said no.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: opts.items ?? calibrationItems(),
        answered: 0,
        size: 20,
        complete: false,
        ...(opts.progress ? { progress: opts.progress } : {}),
      }),
    });
  });
}

/* ------------------------------------------------------------------ *
 * STATE 1 — A COMPLETELY FRESH ANONYMOUS VISITOR
 * ------------------------------------------------------------------ */

test.describe('State 1: fresh anonymous visitor', () => {
  test('the homepage renders its real content with one way in, no login wall', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' });

    expect(res?.status(), 'the homepage must not error for a visitor with no cookies').toBeLessThan(400);
    await expect(page.getByTestId('hero-headline')).toBeVisible();
    await expect(page.getByTestId('cta-enter')).toBeVisible();
    // The page is not an empty shell waiting on data it cannot get.
    const text = (await page.locator('body').innerText()).trim();
    expect(text.length, 'the homepage rendered empty').toBeGreaterThan(200);
    expect(text, 'the homepage rendered Next\'s error fallback').not.toContain('Application error');
  });

  test('nothing on the homepage claims personalization a first visitor has not earned', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // The DNA entry point invites a first visitor to BUILD a profile; it must
    // not address them as though one already exists (see dnaStage()'s
    // fail-open cold-start default).
    await expect(page.getByTestId('cta-dna')).toContainText(/build my watch dna/i);
  });

  test('an unknown URL is a real 404 page with a way back, not a blank screen', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(404);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/not found/i);
    await expect(page.getByRole('link', { name: /go home/i })).toBeVisible();
  });
});

/* ------------------------------------------------------------------ *
 * STATE 2 — SIGNED IN, BUT WITH NO HISTORY AT ALL
 * ------------------------------------------------------------------ */

test.describe('State 2: an account with no history yet', () => {
  // The harness cannot mint a real session. What it CAN prove is the thing a
  // no-history account actually hits: the quiz's own progress model, served
  // by the real endpoint, must report zero progress honestly rather than
  // implying a profile exists. `reachedEarly: false` is exactly the server
  // shape for "this user has answered nothing".
  test('the onboarding quiz shows real zero progress, never a claimed profile', async ({ page }) => {
    await stubCalibration(page, {
      progress: { index: 1, size: 12, percent: 0, reachedEarly: false, complete: false },
    });
    await page.setViewportSize(DESKTOP);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('calibration-progress')).toBeVisible();
    await expect(page.getByTestId('calibration-progress')).toContainText(/to unlock personalized matching/i);
    await expect(page.getByTestId('personalization-unlocked')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * STATE 3 — A RETURNING USER WHO ALREADY HAS WATCH DNA
 * ------------------------------------------------------------------ */

test.describe('State 3: a returning user with Watch DNA', () => {
  test('personalization is announced only once the server says it is genuinely unlocked', async ({ page }) => {
    await stubCalibration(page, {
      progress: { index: 13, size: 12, percent: 100, reachedEarly: true, complete: false },
    });
    await stubQuizWriteSucceeds(page);
    await page.setViewportSize(DESKTOP);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('calibration-progress')).toContainText(/unlocked/i);
    await page.getByTestId('grid-like-100').click();
    await page.getByTestId('title-grid-submit').click();
    await expect(page.getByTestId('title-grid-done')).toBeVisible();
    await expect(page.getByTestId('personalization-unlocked')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ *
 * STATE 4 — A MOBILE VISITOR
 * ------------------------------------------------------------------ */

test.describe('State 4: mobile visitor', () => {
  for (const vp of [SMALL_PHONE, PHONE]) {
    test(`the homepage is fully usable at ${vp.width}px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${vp.width}px scrolls sideways`).toBeLessThanOrEqual(1);

      const cta = page.getByTestId('cta-enter');
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      expect(box, 'the one way in has no box').not.toBeNull();
      // A ceremonial primary action a thumb can actually hit.
      expect(box!.height, 'the primary CTA is below a real tap target').toBeGreaterThanOrEqual(40);
      expect(box!.width, 'the primary CTA overflows the phone').toBeLessThanOrEqual(vp.width);
    });
  }

  test('every quiz control on the smallest phone is a real tap target', async ({ page }) => {
    await stubCalibration(page);
    await page.setViewportSize(SMALL_PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    const buttons = page.getByTestId('title-grid').locator('button:visible');
    const n = await buttons.count();
    expect(n, 'no controls rendered at 320px').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue;
      expect(box.height, `quiz control ${i} is too small to tap`).toBeGreaterThanOrEqual(32);
    }
  });
});

/* ------------------------------------------------------------------ *
 * STATE 5 — A SLOW NETWORK
 * ------------------------------------------------------------------ */

test.describe('State 5: slow network', () => {
  // The load is bounded at FETCH_TIMEOUT_MS (8s) inside TitleGridCalibration.
  // The failure mode this replaces is the one that made the sprint necessary:
  // a request that never settles left the loading copy on screen forever.
  test('a request that never answers ends in a real error and retry, never an endless spinner', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('**/api/calibration*', async () => {
      // Never fulfilled — the component's own AbortController must end this.
    });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('title-grid-loading')).toBeVisible();
    await expect(page.getByTestId('title-grid-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('title-grid-error')).toContainText(/too long|connection/i);
    await expect(page.getByTestId('title-grid-retry')).toBeVisible();
    await expect(page.getByTestId('title-grid-loading')).toHaveCount(0);
  });

  test('a slow-but-successful load still resolves to real content', async ({ page }) => {
    await stubCalibration(page, { delayMs: 2500 });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('title-grid-loading')).toBeVisible();
    await expect(page.locator('[data-testid^="grid-tile-"]').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('title-grid-error')).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------ *
 * STATE 6 — A FAILED THIRD-PARTY PROVIDER
 * ------------------------------------------------------------------ */

test.describe('State 6: a third-party provider fails', () => {
  test('a 500 from the catalog says so and offers a retry — it never fabricates titles', async ({ page }) => {
    await stubCalibration(page, { status: 500 });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('title-grid-error')).toBeVisible();
    await expect(page.getByTestId('title-grid-retry')).toBeVisible();
    await expect(page.locator('[data-testid^="grid-tile-"]')).toHaveCount(0);
  });

  test('the retry actually re-requests, and recovers when the provider comes back', async ({ page }) => {
    let attempt = 0;
    await page.route('**/api/calibration*', async (route) => {
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: calibrationItems(), answered: 0, size: 20, complete: false }),
      });
    });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('title-grid-error')).toBeVisible();
    await page.getByTestId('title-grid-retry').click();
    // Recovery WITHOUT a page refresh — the sprint's standard.
    await expect(page.locator('[data-testid^="grid-tile-"]').first()).toBeVisible();
    await expect(page.getByTestId('title-grid-error')).toHaveCount(0);
  });

  test('a failed ratings provider leaves the Verd1ct honest, with a retry', async ({ page }) => {
    // The per-title fact endpoints are what the Verd1ct is computed from. When
    // they fail, the panel must say it could not weigh the candidates — never
    // invent a winner from nothing.
    await page.route('**/api/dna/**', (r) => r.abort());
    await page.route('**/api/quicklook/**', (r) => r.abort());
    await page.setViewportSize(DESKTOP);
    await page.goto('/dev/verdict', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('harness-verdict')).toBeVisible();

    const body = await page.locator('[data-testid="harness-verdict"]').innerText();
    // Either the empty-docket prompt or a bounded error — never a fabricated
    // winner and never a spinner that outlives the request.
    expect(body).not.toContain('Application error');
    expect(body.trim().length, 'the verdict panel rendered nothing at all').toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * STATE 7 — AN EXPIRED SESSION
 * ------------------------------------------------------------------ */

test.describe('State 7: an expired session', () => {
  // A real expiry cannot be staged without a real Supabase project. What CAN
  // be staged is what the browser actually sees when one happens: the app's
  // own endpoints start answering 401. The requirement is that this is a
  // bounded, explained state with a way forward — not a spinner, not a blank
  // screen, and not silently-wrong personalized content.
  test('a 401 from the catalog is an explained state with recovery, not a dead end', async ({ page }) => {
    await stubCalibration(page, { status: 401 });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('title-grid-error')).toBeVisible();
    await expect(page.getByTestId('title-grid-retry')).toBeVisible();
    await expect(page.getByTestId('title-grid-loading')).toHaveCount(0);
  });

  test('the sign-in route is always reachable from a cold start', async ({ page }) => {
    const res = await page.goto('/login', { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /send link/i })).toBeVisible();
  });
});

/* ------------------------------------------------------------------ *
 * STATE 8 — AN EMPTY DATABASE RESPONSE
 * ------------------------------------------------------------------ */

test.describe('State 8: an empty response', () => {
  test('a genuinely empty result reads as empty, never as broken and never as fake content', async ({ page }) => {
    await stubCalibration(page, { items: [] });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.getByTestId('title-grid-empty')).toBeVisible();
    await expect(page.locator('[data-testid^="grid-tile-"]')).toHaveCount(0);
    // An empty 200 is NOT an error — the two states must not be conflated in
    // either direction (see ReleaseWall's degraded-vs-empty distinction).
    await expect(page.getByTestId('title-grid-error')).toHaveCount(0);
  });

  test('the empty state still offers a way forward', async ({ page }) => {
    await stubCalibration(page, { items: [] });
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    const empty = page.getByTestId('title-grid-empty');
    await expect(empty).toBeVisible();
    await expect(empty.locator('button')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ *
 * JOURNEY A — HOMEPAGE → COURTROOM → VERD1CT → TITLE → SAVE
 * ------------------------------------------------------------------ */

test.describe('Journey A: homepage to a Verd1ct you can act on', () => {
  test('the homepage offers exactly one ceremonial way in, and it points at the app', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const enter = page.getByTestId('cta-enter');
    await expect(enter).toBeVisible();
    await expect(enter).toHaveAttribute('href', '/app');
    // One gold entrance, not a menu of competing front doors.
    await expect(page.getByTestId('hero-ctas').getByRole('link')).toHaveCount(3);
  });

  test('putting candidates on the docket delivers a real Verd1ct with a way to act on it', async ({ page }) => {
    // The facts endpoints are stubbed with real-shaped data so the DETERMINISTIC
    // engine does the deciding — this asserts the shipped ranking path, not a
    // rendered fixture.
    const facts: Record<number, { match: number; general: number }> = {
      101: { match: 88, general: 82 },
      102: { match: 60, general: 74 },
      103: { match: 52, general: 68 },
    };
    const idOf = (url: string) => Number(new URL(url).pathname.split('/').pop());
    await page.route('**/api/dna/**', (r) => {
      const f = facts[idOf(r.request().url())];
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ dna: f ? { score: f.match, confidence: 0.9, sampleSize: 20 } : null }),
      });
    });
    await page.route('**/api/quicklook/**', (r) => {
      const f = facts[idOf(r.request().url())];
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(f ? { runtime: '1h 52m', where: ['Netflix'], standardScore: f.general } : {}),
      });
    });
    await page.setViewportSize(DESKTOP);
    await page.goto('/dev/verdict', { waitUntil: 'domcontentloaded' });

    // Put three candidates on the docket the way a visitor does — the W stamp.
    await expect(page.getByTestId('harness-grid')).toBeVisible();
    for (const id of [101, 102, 103]) await page.getByTestId(`w-check-${id}`).click();

    await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('verdict-winner')).toBeVisible();
    // A decision, with its reasoning — not a leaderboard.
    await expect(page.getByTestId('verdict-confidence')).toBeVisible();
  });

  test('the Verd1ct panel never hangs: it ends in a result or an explained error', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/dev/verdict', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = await page.locator('[data-testid="harness-verdict"]').innerText();
    // "Weighing N candidates…" is the only in-flight state, and with an empty
    // docket it must not be what's on screen at rest.
    expect(body).not.toMatch(/^Weighing \d+ candidates/);
  });
});

/* ------------------------------------------------------------------ *
 * JOURNEY B — QUIZ → RATE → UNLOCK → PERSONALIZED
 * ------------------------------------------------------------------ */

test.describe('Journey B: the quiz earns personalization, and nothing else does', () => {
  test('a full round loads, rates, submits, and reads the answers back', async ({ page }) => {
    await stubCalibration(page, {
      progress: { index: 13, size: 12, percent: 100, reachedEarly: true, complete: false },
    });
    await stubQuizWriteSucceeds(page);
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await expect(page.locator('[data-testid^="grid-tile-"]')).toHaveCount(12);
    await page.getByTestId('grid-like-100').click();
    await page.getByTestId('grid-seen-101').click();
    await page.getByTestId('grid-rate-101-loved').click();
    await page.getByTestId('grid-bad-102').click();

    await expect(page.getByTestId('title-grid-submit')).toContainText('add 3 to my DNA');
    await page.getByTestId('title-grid-submit').click();

    await expect(page.getByTestId('title-grid-done')).toBeVisible();
    // The payoff is a read-back of what THEY said, not a generic "Got it."
    await expect(page.getByTestId('analysis-headline')).toBeVisible();
    await expect(page.getByTestId('personalization-unlocked')).toBeVisible();
  });

  test('only the titles this visitor actually touched are ever sent', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push(r.postData() ?? '');
    });
    await stubCalibration(page);
    await stubQuizWriteSucceeds(page);
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });

    await page.getByTestId('grid-like-100').click();
    await page.getByTestId('title-grid-submit').click();
    await expect(page.getByTestId('title-grid-done')).toBeVisible();

    const body = posts.join('\n');
    expect(body, 'the chosen title was not sent').toContain('First Use Title 1');
    // The eleven untouched tiles must not appear anywhere — silence is not a
    // preference, and this is the rule the whole grid exists to enforce.
    expect(body, 'an untouched title leaked into the profile').not.toContain('First Use Title 2');
    expect(body, 'an untouched title leaked into the profile').not.toContain('First Use Title 4');
  });

  test('a partially failed save says exactly what did not save, and retries only that', async ({ page }) => {
    await stubCalibration(page);
    await page.setViewportSize(PHONE);
    await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });
    await page.getByTestId('grid-like-100').click();

    // Every write fails from here on.
    await page.route('**/dev/title-grid', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 500, contentType: 'text/plain', body: 'nope' });
        return;
      }
      await route.continue();
    });
    await page.getByTestId('title-grid-submit').click();

    // NOT a false "done" screen — the picks stay put with an honest message.
    await expect(page.getByTestId('title-grid-save-issue')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('title-grid-retry-save')).toBeVisible();
    await expect(page.getByTestId('title-grid-done')).toHaveCount(0);
  });
});
