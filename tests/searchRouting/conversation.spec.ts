/**
 * MULTI-TURN CONVERSATION — browser verification.
 *
 * Drives the real AskTheJudge component in the local production build. The
 * /api/ask network edge is mocked INSIDE the test with the same canonical
 * conversation module the server runs (applyTurn/chipsFor), so what is
 * verified here is the full client machinery: per-turn state exchange, chip
 * rendering, chip removal, and persistence across reload. The server-side
 * merge itself is covered by the frozen multi-turn corpus; the live path is
 * verified against production separately.
 */
import { test, expect, type Page } from '@playwright/test';
import { applyTurn, chipsFor, sanitizeRequestState } from '../../src/lib/nlu/conversationState';

/** Turn-1 items carry old years so "Newer." has real context to anchor to. */
const ITEM_YEARS = [1976, 1982, 1990, 2001, 2015];

function items() {
  return ITEM_YEARS.map((year, i) => ({
    id: 1000 + i,
    mediaType: 'movie',
    title: `Title ${year}`,
    year,
    posterUrl: null,
    posterPath: null,
    matchScore: 80 - i,
    primaryCall: 'WATCH IT',
    reason: 'test fixture',
    where: null,
    deciderUrl: 'https://example.com',
  }));
}

const captured: unknown[] = [];

async function armAsk(page: Page) {
  captured.length = 0;
  await page.route('**/api/ask', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      text?: string;
      conversation?: unknown;
      turnContext?: { shownYears?: number[]; shownIds?: { mediaType: 'movie' | 'tv'; id: number }[] };
    };
    captured.push(body);
    const prev = sanitizeRequestState(body.conversation);
    const turn = applyTurn(prev, body.text ?? '', { ...body.turnContext, nowYear: 2026 });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'search',
        query: {},
        scoredFor: 'You',
        relaxed: null,
        items: items(),
        conversation: turn.state,
        chips: chipsFor(turn.state),
        interpretation: turn.interpretation,
        clarify: turn.clarify,
        userKey: 'harness-user',
      }),
    });
  });
  await page.route('**://*.supabase.co/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}

async function sayToJudge(page: Page, text: string) {
  await page.getByPlaceholder(/Tell the judge/).fill(text);
  await page.getByRole('button', { name: 'File it' }).click();
  await expect(page.getByPlaceholder(/Tell the judge/)).toHaveValue('');
}

test.describe('five-turn Judge conversation', () => {
  test('constraints accumulate across five turns and every chip stays visible', async ({ page }) => {
    await armAsk(page);
    await page.goto('/dev/judge-harness');

    await sayToJudge(page, 'Something like Rocky.');
    await expect(page.getByTestId('chip-ref:Rocky')).toBeVisible();

    await sayToJudge(page, 'Newer.');
    await expect(page.getByTestId('chip-years')).toContainText('1991 or later');

    await sayToJudge(page, 'No documentaries.');
    await expect(page.getByTestId('chip-nodocs')).toBeVisible();

    await sayToJudge(page, 'Under two hours.');
    await expect(page.getByTestId('chip-runtime')).toContainText('under 120m');

    await sayToJudge(page, 'Only things included with Hulu.');
    await expect(page.getByTestId('chip-prov:Hulu')).toBeVisible();

    // All five turns' constraints coexist — nothing was silently dropped.
    for (const id of ['chip-ref:Rocky', 'chip-years', 'chip-nodocs', 'chip-runtime', 'chip-prov:Hulu']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }

    // The request bodies really carried the accumulated state.
    const lastBody = captured[captured.length - 1] as { conversation?: { referenceTitles?: string[]; minYear?: number } };
    expect(lastBody.conversation?.referenceTitles).toContain('Rocky');
    expect(lastBody.conversation?.minYear).toBe(1991);
  });

  test('removing one chip is surgical and re-files the case', async ({ page }) => {
    await armAsk(page);
    await page.goto('/dev/judge-harness');
    await sayToJudge(page, 'Something like Rocky, no documentaries, under 2 hours');
    await expect(page.getByTestId('chip-nodocs')).toBeVisible();

    const before = captured.length;
    await page.getByTestId('chip-nodocs').click();
    await expect(page.getByTestId('chip-nodocs')).toHaveCount(0);
    await expect(page.getByTestId('chip-runtime')).toBeVisible();
    await expect(page.getByTestId('chip-ref:Rocky')).toBeVisible();

    // The removal immediately re-filed with the corrected state.
    await expect
      .poll(() => captured.length, { timeout: 5_000 })
      .toBeGreaterThan(before);
    const refile = captured[captured.length - 1] as { conversation?: { excludeGenreIds?: number[] } };
    expect(refile.conversation?.excludeGenreIds ?? []).not.toContain(99);
  });

  test('the conversation survives a page reload', async ({ page }) => {
    await armAsk(page);
    await page.goto('/dev/judge-harness');
    await sayToJudge(page, 'boxing movies, no documentaries');
    await expect(page.getByTestId('chip-nodocs')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('chip-nodocs')).toBeVisible();
    await expect(page.getByTestId('chip-subj:boxing')).toBeVisible();
  });

  test('mobile 390x844: chips are tappable and the flow works end to end', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await armAsk(page);
    await page.goto('/dev/judge-harness');
    await sayToJudge(page, 'Something like Rocky.');
    await sayToJudge(page, 'Only on Netflix.');
    await expect(page.getByTestId('chip-prov:Netflix')).toBeVisible();
    const box = await page.getByTestId('chip-prov:Netflix').boundingBox();
    expect(box, 'chip must have a real tap target').not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(28);
  });
});
