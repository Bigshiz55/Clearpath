import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * KEYSTROKE → VISIBLE RESULT, for a one-word SUBJECT search.
 *
 * The reported production defect: a signed-in user typed "boxing" and the app
 * showed the generic "Recommended for you" feed with Absentia — the query was
 * dropped/ignored and a specific search silently became a personalized
 * recommendation. The header routes a bare subject to /app/ask?q=…, which
 * seeds AskTheJudge; this drives that EXACT component (via /dev/judge-harness,
 * MOBILE_HARNESS-gated) at an iPhone viewport, with /api/ask mocked so the
 * transport, state and rendering are what is measured — not the model.
 *
 * Every test asserts, in one form or another:
 *   • the EXACT typed query reached the server (POST body.text),
 *   • the results screen says Results for "<query>",
 *   • the returned subject titles render,
 *   • the generic recommendations feed NEVER appears after a specific search.
 */

const IPHONE = { width: 390, height: 844 };

/** A boxing-eligible payload shaped like the real /api/ask response. */
function askPayload(query: string, titles: Array<{ id: number; title: string; year: number }>) {
  return {
    kind: 'search',
    requestId: `req-${query.replace(/\s+/g, '-')}-0001`,
    appliedText: query,
    conversation: { subjects: [query] },
    chips: [{ id: `subj:${query}`, label: query }],
    interpretation: [`Required subject: ${query} (central).`],
    diagnostics: {
      requestedCount: null,
      candidateCount: 24,
      deterministicEligibleCount: 20,
      semanticEvaluatedCount: 20,
      centralSubjectEligibleCount: titles.length,
      qualityEligibleCount: titles.length,
      finalReturnedCount: titles.length,
    },
    scoredFor: 'Your match',
    relaxed: null,
    userKey: 'test-user-key',
    items: titles.map((t, i) => ({
      id: t.id,
      mediaType: 'movie',
      title: t.title,
      year: t.year,
      posterUrl: null,
      posterPath: null,
      matchScore: 90 - i,
      generalScore: 80,
      primaryCall: 'WATCH IT',
      reason: `${query} is central to this title`,
      where: 'Netflix',
      deciderUrl: '#',
      subjectEvidence: {
        constraint: query,
        satisfied: true,
        status: 'PASS',
        centrality: 'CENTRAL',
        confidence: 90,
        evidenceType: 'centrality',
        evidence: `the story is about ${query}`,
        rejectionReason: null,
      },
    })),
  };
}

const BOXING_TITLES = [
  { id: 312221, title: 'Creed', year: 2015 },
  { id: 480530, title: 'Creed II', year: 2018 },
  { id: 45317, title: 'The Fighter', year: 2010 },
];

/** Capture every POST /api/ask body while returning a subject-eligible answer. */
async function mockAsk(page: Page, opts: { status?: number; delayMs?: number; empty?: boolean } = {}) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/ask', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.status && opts.status >= 400) {
      await route.fulfill({ status: opts.status, contentType: 'application/json', body: JSON.stringify({ error: 'down' }) });
      return;
    }
    const q = String((body.text as string) ?? '').trim() || 'boxing';
    const titles = opts.empty ? [] : q === 'boxing' ? BOXING_TITLES : [{ id: 1, title: `${q[0]?.toUpperCase()}${q.slice(1)} One`, year: 2020 }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(askPayload(q, titles)) });
  });
  return bodies;
}

const header = (page: Page) => page.getByTestId('search-results-header');
const noGenericFeed = async (page: Page) => {
  await expect(page.getByText(/Recommended for you/i)).toHaveCount(0);
  await expect(page.getByText(/Ranked by your VERD1CT DNA/i)).toHaveCount(0);
  await expect(page.getByText(/Ready to watch/i)).toHaveCount(0);
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(IPHONE);
});

test('typing "boxing" reaches the server verbatim and renders boxing results — never the generic feed', async ({ page }) => {
  const bodies = await mockAsk(page);
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });

  // The seed auto-submits (the keystroke→submit path the header drives).
  await expect(header(page)).toBeVisible();
  await expect(header(page)).toHaveAttribute('data-answering-for', 'boxing');
  await expect(page.getByTestId('search-request-id')).toBeVisible();

  // The EXACT query reached the server.
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
  expect(bodies[0]!.text).toBe('boxing');

  // Boxing titles render; Absentia / the generic feed do not.
  await expect(page.getByText('Creed', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Absentia')).toHaveCount(0);
  await noGenericFeed(page);
});

test('a slow /api/ask still lands on the boxing results, not a fallback feed', async ({ page }) => {
  const bodies = await mockAsk(page, { delayMs: 1500 });
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/deliberating/i)).toBeVisible(); // honest loading state
  await expect(page.getByText('Creed', { exact: true }).first()).toBeVisible({ timeout: 8000 });
  expect(bodies[0]!.text).toBe('boxing');
  await noGenericFeed(page);
});

test('an /api/ask 500 shows an honest error, never the generic recommendations feed', async ({ page }) => {
  await mockAsk(page, { status: 500 });
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });
  await expect(header(page)).toBeVisible();
  await expect(page.getByText(/hit a snag/i)).toBeVisible();
  await noGenericFeed(page);
});

test('zero eligible results is an honest shortfall, never Absentia or the generic feed', async ({ page }) => {
  await mockAsk(page, { empty: true });
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });
  await expect(header(page)).toBeVisible();
  await expect(page.getByText(/No title clears/i)).toBeVisible();
  await expect(page.getByText('Absentia')).toHaveCount(0);
  await noGenericFeed(page);
});

test('a second query after the first reaches the server and updates the header', async ({ page }) => {
  const bodies = await mockAsk(page);
  await page.goto('/dev/judge-harness?q=boxing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Creed', { exact: true }).first()).toBeVisible();

  await page.getByPlaceholder(/Tell the judge/i).fill('chess');
  await page.getByRole('button', { name: 'File it' }).click();

  await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(2);
  expect(bodies[bodies.length - 1]!.text).toBe('chess');
  await expect(header(page)).toHaveAttribute('data-answering-for', 'chess');
  await noGenericFeed(page);
});

// Cross-domain: the SAME transport carries any subject verbatim and never
// degrades to the generic feed. No per-subject code anywhere in this path.
for (const subject of ['courtroom', 'christmas', 'detective', 'journalism', 'chess', 'mountaineering', 'political campaign', 'medical drama', 'serial killer']) {
  test(`"${subject}" reaches the server verbatim and shows Results for "${subject}"`, async ({ page }) => {
    const bodies = await mockAsk(page);
    await page.goto(`/dev/judge-harness?q=${encodeURIComponent(subject)}`, { waitUntil: 'domcontentloaded' });
    await expect(header(page)).toHaveAttribute('data-answering-for', subject);
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies[0]!.text).toBe(subject);
    await noGenericFeed(page);
  });
}
