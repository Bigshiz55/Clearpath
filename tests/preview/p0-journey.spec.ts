import { test, expect } from '@playwright/test';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE ORIGINAL INCIDENT, THROUGH THE REAL DEPLOYED SURFACE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A user typed "3 Sylvester Stallone movies" into the hero box and got the
 * generic Watch Now feed. This spec drives the ENTIRE chain the incident
 * broke, against the exact-SHA Vercel Preview, in a real browser:
 *
 *   real typed entry (BuildCaseBox, the real gavel button)
 *   → client routing to /app/ask with the RAW utterance intact
 *   → the page's own POST /api/ask
 *   → canonical receipt (movie, count 3, cast 16483, no stallone subject)
 *   → typed Finder execution → 3 movie results
 *   → the poster grid RENDERS those exact titles
 *
 * Auth is the app's own: a preview-only test login mints the same SSR
 * cookies a person's sign-in writes. Deployment Protection is cleared with
 * the standard bypass header. No secret value is ever printed.
 */

const BASE_URL = process.env.BASE_URL ?? '';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '';
const LOGIN_SECRET = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';

test.describe('P0 journey — 3 Sylvester Stallone movies', () => {
  test.skip(!BASE_URL, 'BASE_URL (the exact-SHA preview) is required');

  test('typed UI entry → /app/ask → canonical execution → rendered titles', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    });

    const page = await context.newPage();

    /* A GENUINELY FRESH USER, the way the product makes one: /newuser signs
       in anonymously (FreshStart) and lands on /app with a guest profile that
       skips the signed-up onboarding redirect. If anonymous sign-in is
       disabled on this deployment, fall back to the preview test login — the
       journey from the entry box onward is identical either way, and which
       path authenticated is logged for the record. */
    await page.goto('/newuser');
    let box = page.getByTestId('statecase-card');
    const guestWorked = await box.isVisible({ timeout: 20_000 }).catch(() => false)
      || (await page.waitForURL(/\/app(?:$|[/?#])/, { timeout: 20_000 }).then(() => true).catch(() => false)
          && await box.isVisible({ timeout: 10_000 }).catch(() => false));
    if (guestWorked) {
      console.log('AUTH PATH: anonymous guest via /newuser');
    } else {
      console.log('AUTH PATH: preview test login fallback');
      const login = await context.request.post('/api/preview-test-login', {
        headers: { 'x-preview-test-secret': LOGIN_SECRET },
      });
      expect(login.status(), 'preview test login must mint a session').toBe(200);
      await page.goto('/app');
      box = page.getByTestId('statecase-card');
    }
    await expect(box, 'the real State Your Case entry').toBeVisible({ timeout: 20_000 });
    await box.locator('textarea').fill('3 Sylvester Stallone movies');

    const askResponse = page.waitForResponse(
      (r) => r.url().includes('/api/ask') && r.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await box.getByRole('button', { name: /gavel/i }).click();

    // Transport: the canonical door, raw utterance intact.
    await page.waitForURL(/\/app\/ask\?/, { timeout: 30_000 });
    const q = new URL(page.url()).searchParams.get('q');
    expect(q, 'the RAW utterance must travel — nothing pre-digested').toBe('3 Sylvester Stallone movies');

    // Receipt: one interpretation, typed execution.
    const res = await askResponse;
    const body = (await res.json()) as {
      kind?: string;
      query?: Record<string, unknown>;
      items?: Array<{ title: string; mediaType: string }>;
    };
    expect(body.kind, 'a search, not a feed and not a clarification').toBe('search');
    expect(body.query?.mediaType).toBe('movie');
    expect(body.query?.castIds, 'Sylvester Stallone, resolved').toEqual([16483]);
    expect(body.query?.finalCount, 'the count the sentence carried').toBe(3);
    const subjectSurface = JSON.stringify([
      body.query?.subjectCanonical,
      body.query?.subjectLabel,
      body.query?.subjectLexemes,
    ]).toLowerCase();
    expect(subjectSurface, 'no Stallone-derived content subject').not.toContain('stallone');

    // World: exactly three movies, no TV padding.
    const items = body.items ?? [];
    expect(items, 'exactly 3 results').toHaveLength(3);
    for (const it of items) expect(it.mediaType, `"${it.title}" must be a movie`).toBe('movie');

    // Render: the screen shows those exact titles — not a generic feed.
    for (const it of items) {
      await expect(
        page.locator('.poster-grid').getByText(it.title, { exact: false }).first(),
        `rendered grid must show "${it.title}"`,
      ).toBeVisible({ timeout: 30_000 });
    }
    console.log(`RENDERED TITLES: ${items.map((i) => i.title).join(' | ')}`);

    await context.close();
  });
});
