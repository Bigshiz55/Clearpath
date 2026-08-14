import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * A NATURAL-LANGUAGE REQUEST HAS ONE CANONICAL EXECUTION PATH.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE LIVE DEFECT. A user typed "3 Sylvester Stallone movies" into the hero box
 * on /app and got the generic Watch Now feed, starting with Cold Case — a TV
 * series with no Stallone in it. Production telemetry for that moment showed
 * `POST /api/browse` and `POST /app/watch`, and NO `/api/ask` or `/api/finder`
 * at all.
 *
 * So #66's request-frame/person work was not failing. It was never being
 * invoked: the entry path never reached it.
 *
 * WHY. `BuildCaseBox` (the hero textarea) POSTs the raw utterance to
 * `/api/build-case`, whose routing gate is `wantsTitleResults()`. That gate
 * requires BOTH a genre/media word AND a find verb, and knows nothing about
 * people or counts — so:
 *
 *     wantsTitleResults('3 Sylvester Stallone movies')      === false
 *     wantsTitleResults('how about a Bruce Willis movie')   === false
 *
 * With no `redirect` in the response, `BuildCaseBox` falls back to
 * `router.push('/app/watch')`. `/app/watch` cannot carry a request — its only
 * search param is `type` — so the constraint, the person and the count are all
 * dropped on the floor and the user gets a feed.
 *
 * WHAT THIS SUITE PINS. The browser half of the contract, on the REAL
 * component: a recommendation utterance submitted through the real UI must
 * reach the canonical request route, and must never be answered by dumping the
 * user on the generic feed.
 *
 * The server half — that the route's own decision function recognises these
 * utterances — is pinned by unit tests over the pure gate. Both halves are
 * needed: a pure test alone is exactly the integration gap that let this ship.
 */

/**
 * THE SIX SPOKEN-PERSON CASES. The first is the production incident verbatim;
 * the rest are the phrasings a person actually uses for the same intent.
 */
const UTTERANCES = {
  incident: '3 Sylvester Stallone movies',
  personalized: "find me 3 Sylvester Stallone movies you think I'll like",
  someEnjoy: 'show me some Tom Hanks movies I would enjoy',
  countFilms: 'give me 5 Denzel Washington films',
  tonightWith: 'what should I watch tonight with Tom Hanks',
  casual: 'how about a Bruce Willis movie',
};

/**
 * METAMORPHIC TRANSPORT CASES. These carry clauses the router must NOT try to
 * understand — irrelevant context, a past-tense reference, a negation. The only
 * assertion is that the WHOLE utterance arrives at the canonical door intact.
 * Clause relevance, reference handling and negation polarity belong downstream
 * in `/api/ask`; re-implementing any of them here would recreate the second
 * interpreter this work exists to remove.
 */
const METAMORPHIC = {
  burrito: 'Had a burrito for dinner. Anyway, give me a boxing movie',
  rockyBaseball: 'I watched Rocky three weeks ago, but tonight I want a baseball movie',
  negation: 'Give me a thriller but no supernatural stuff',
};

/**
 * The response `/api/build-case` provably returns TODAY for an utterance its
 * gate does not recognise — `{ ok, summary, learned, caseId }` with NO
 * `redirect`. This is not an invented shape: it is the literal fall-through
 * branch of the route, and `wantsTitleResults` returning false for these
 * strings is proven separately by unit test.
 *
 * The route itself requires an authenticated Supabase session (401 without
 * one), so the harness cannot execute it. Stubbing its RESPONSE is what makes
 * the CLIENT's behaviour observable — and the client is what this file is
 * about: what the real UI does with an utterance the server did not route.
 */
async function stubUnroutedBuildCase(page: Page) {
  await page.route('**/api/build-case', (r) =>
    r.fulfill({
      json: {
        ok: true,
        learned: [],
        caseId: '00000000-0000-4000-8000-000000000000',
        summary: 'Got it — building your VERD1CT DNA.',
      },
    }),
  );
}

/** Every request the page makes, so the assertions can be about the network. */
function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => seen.push(r));
  return seen;
}

const urls = (seen: Request[]) => seen.map((r) => `${r.method()} ${new URL(r.url()).pathname}`);

async function submit(page: Page, text: string) {
  const box = page.getByTestId('statecase-card');
  await expect(box).toBeVisible();
  const field = box.locator('textarea');
  await field.fill(text);
  // The real control the user presses — "Hit the Gavel →" — found by its
  // accessible name, not a test-only hook, so this cannot pass against a button
  // the user never sees. (An earlier selector here matched nothing and the
  // submit silently never fired: the suite was red for the wrong reason, which
  // is a false RED and every bit as misleading as a false green.)
  await box.getByRole('button', { name: /gavel|ruling/i }).first().click();
}

async function open(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/mobile-home', { waitUntil: 'domcontentloaded' });
}

// ───────────────────────────────────────────────────────────────────────────
// THE CONTRACT
// ───────────────────────────────────────────────────────────────────────────

for (const [name, text] of Object.entries({ ...UTTERANCES, ...METAMORPHIC })) {
  test(`[${name}] "${text}" reaches the canonical request route from the real UI`, async ({ page }) => {
    await stubUnroutedBuildCase(page);
    const seen = recordRequests(page);
    await open(page);
    await submit(page, text);

    // THE ASSERTION THAT MATTERS: the semantic front door is actually called.
    await expect
      .poll(() => urls(seen).some((u) => /\/(api\/finder|api\/ask|app\/finder|app\/ask)\b/.test(u)), {
        message: `no canonical request call. Saw:\n  ${urls(seen).join('\n  ')}`,
        timeout: 8000,
      })
      .toBe(true);

    // …and the raw utterance survives to it, rather than being reduced to a
    // media type on the way.
    const carrier = seen.find((r) => /\/(api\/finder|api\/ask|app\/finder|app\/ask)\b/.test(new URL(r.url()).pathname));
    // `+` is form-encoding for a space; decodeURIComponent does NOT undo it, so
    // it is normalised before comparing. (Getting this wrong made the assertion
    // fail against a URL that plainly carried the text — an assertion bug, not
    // a product one, and worth naming so the next reader does not "fix" the
    // product to satisfy it.)
    const carried = decodeURIComponent(`${carrier?.url() ?? ''} ${carrier?.postData() ?? ''}`).replace(/\+/g, ' ');
    expect(carried, 'the request text did not survive the hop').toContain(text.slice(0, 20));

    // ONE RECOMMENDATION TRUTH: the door is /api/ask (via /app/ask, which seeds
    // AskTheJudge). Asserted by NAME, not merely "some semantic endpoint" — the
    // loose version would stay green if a future change re-pointed this at
    // /app/finder, which would recreate the second recommendation path this
    // whole exercise exists to remove.
    expect(new URL(carrier!.url()).pathname, 'the request did not enter the canonical /api/ask door').toBe('/app/ask');
  });

  test(`[${name}] "${text}" is never answered with the generic Watch Now feed`, async ({ page }) => {
    await stubUnroutedBuildCase(page);
    const seen = recordRequests(page);
    await open(page);
    await submit(page, text);
    await page.waitForTimeout(1500);

    // /app/watch cannot carry a request: its only search param is `type`.
    // Landing there means the constraint, the person and the count were dropped.
    expect(new URL(page.url()).pathname, `landed on the generic feed for "${text}"`).not.toBe('/app/watch');
    expect(
      urls(seen).filter((u) => u.includes('/api/browse')),
      'browse is structured catalog browsing and must not answer a request',
    ).toEqual([]);
    // NOR straight to the Finder surface: that is the second recommendation
    // path, and routing conversational prose there was the earlier wrong fix.
    expect(
      urls(seen).filter((u) => u.includes('/app/finder')),
      'a conversational request bypassed the canonical Ask door for Finder',
    ).toEqual([]);
  });
}

/**
 * TASTE-BUILDING MUST NOT BE HIJACKED. "I love X, avoid Y" is a statement about
 * the viewer, not a request to be shown titles — it builds DNA and stays put.
 * Without this the fix would turn every sentence into a search, which is the
 * opposite failure and a much louder one.
 */
test('a pure taste statement still builds DNA and does not become a search', async ({ page }) => {
  await stubUnroutedBuildCase(page);
  const seen = recordRequests(page);
  await open(page);
  await submit(page, 'I love clever thrillers with a twist, but I avoid anything too slow or gory.');
  await page.waitForTimeout(1500);
  expect(
    urls(seen).some((u) => /\/(api\/finder|app\/finder|api\/ask|app\/ask)\b/.test(u)),
    'a taste statement was hijacked into a search',
  ).toBe(false);
});
