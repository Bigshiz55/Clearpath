import type { Page } from '@playwright/test';

/**
 * Play a real session, without knowing what the session will be.
 *
 * The orchestrator decides every move, so a test that hard-codes a screen order
 * is testing a script the product does not have. The driver instead asks "what
 * is on screen?" each turn and answers it, which is also the only way these
 * specs can survive the engine getting smarter.
 */

export const ACTS = {
  context: 'tonight-question',
  stimulus: 'tonight-stimulus',
  twist: 'tonight-twist',
  finalcut: 'tonight-finalists',
  reveal: 'tonight-reveal',
} as const;

export type Act = keyof typeof ACTS;

export async function currentAct(page: Page): Promise<Act | null> {
  for (const act of Object.keys(ACTS) as Act[]) {
    if (await page.getByTestId(ACTS[act]).isVisible().catch(() => false)) return act;
  }
  return null;
}

export interface PlayOptions {
  /** Answer this many moves at most. */
  maxMoves?: number;
  /** Reject the first shortlist offered, then choose from the next. */
  rejectFirstFinal?: boolean;
  /** Answer every stimulus "never heard of it". */
  allUnseen?: boolean;
  /** Called after each answered move. */
  onMove?: (act: Act, index: number) => Promise<void> | void;
}

/**
 * Answer one move. Returns the act answered, or null when the session is over.
 */
export async function answerOne(
  page: Page,
  opts: { unseen?: boolean; rejectFinal?: boolean; index?: number } = {},
): Promise<Act | null> {
  const act = await currentAct(page);
  if (act === null || act === 'reveal') return act === 'reveal' ? null : null;

  if (act === 'context') {
    await page.locator('[data-testid^="tonight-option-"]').first().click();
  } else if (act === 'stimulus') {
    if (opts.unseen) await page.getByTestId('tonight-unseen').click();
    // Alternate so the profile actually develops a shape rather than a
    // uniform "everything, please" that teaches the engine nothing.
    else await page.getByTestId((opts.index ?? 0) % 3 === 2 ? 'tonight-cut' : 'tonight-pull').click();
  } else if (act === 'twist') {
    await page.getByTestId('tonight-twist-stay').click();
  } else if (act === 'finalcut') {
    if (opts.rejectFinal) await page.getByTestId('tonight-reject-all').click();
    else await page.locator('[data-testid^="tonight-final-"]').first().click();
  }
  /*
   * The surface guards against a double tap for ADVANCE_MS, so the next answer
   * has to land after that window or it is dropped by design and the test
   * would be measuring its own impatience.
   *
   * A "wait until the act changes" condition looks stricter and is wrong here:
   * consecutive moves are frequently the same act (stimulus after stimulus),
   * so it would pass instantly without the guard having lifted.
   */
  await page.waitForTimeout(240);
  return act;
}

/** Play to the Reveal. Returns every act answered, in order. */
export async function playToReveal(page: Page, opts: PlayOptions = {}): Promise<Act[]> {
  const { maxMoves = 40, rejectFirstFinal = false, allUnseen = false } = opts;
  const seen: Act[] = [];
  let rejected = false;

  for (let i = 0; i < maxMoves; i++) {
    if (await page.getByTestId('tonight-reveal').isVisible().catch(() => false)) break;
    const rejectFinal = rejectFirstFinal && !rejected;
    const act = await answerOne(page, { unseen: allUnseen, rejectFinal, index: i });
    if (act === null) break;
    if (act === 'finalcut' && rejectFinal) rejected = true;
    seen.push(act);
    await opts.onMove?.(act, i);
  }
  return seen;
}

/** Fresh session: no resumed state, no carried-over DNA. */
export async function openFresh(page: Page): Promise<void> {
  await page.goto('/dev/tonight');
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload();
  await page.getByTestId('tonight-question').waitFor({ timeout: 15_000 });
}
