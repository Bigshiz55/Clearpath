import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * §4 THE VERD1CT REVEAL SEQUENCE. Drives the real CourtRoom component on
 * /dev/court with the room already at `status: 'verdict'`, so the sequence
 * plays exactly as it would in production: jurors' scores flip in one by
 * one, vetoed titles cross out naming who struck them, then the winning
 * title itself resolves last. `revealTimeline`'s pure timing is already
 * covered by verdictReveal.test.ts; this proves the SEQUENCE actually reads
 * that way on screen, and that prefers-reduced-motion collapses it honestly.
 */

const HARNESS = '/dev/court';
const HOST_TOKEN = 'host-token-abcdefgh';
const SHOTS = 'test-results/verdict-reveal';

function finalist(rank: number, id: number, title: string, fits: [string, number][], year = 2019) {
  return {
    rank, id, mediaType: 'movie', title, year, posterUrl: null,
    attributes: ['Mystery'], genres: ['Mystery'],
    perMember: fits.map(([name, score]) => ({ name, score, picked: false })),
    pickedBy: [], fit: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    minScore: Math.min(...fits.map((f) => f[1])), avgScore: Math.round(fits.reduce((s, f) => s + f[1], 0) / fits.length),
    streaming: ['Netflix'],
  };
}

interface RoomModel {
  status: 'verdict';
  participants: { id: string; name: string; host?: boolean; reactions?: Record<string, { r: string }> }[];
  finalists: unknown[];
  messages: unknown[];
  hostName?: string | null;
}

/**
 * `groupRank` marks a candidate vetoed from PARTICIPANT REACTIONS
 * (`p.reactions['movie-12'] = { r: 'veto' }`), never from a finalist's own
 * score — a low `perMember` score alone is a bad match, not a veto.
 *
 * IMPORTANT for fixtures: only put a veto here for a participant OTHER than
 * the current viewer. CourtRoom reads its OWN reactions from local
 * optimistic state (`myReactions`/localStorage), not from the server's echo
 * of `participants[].reactions` — a veto attributed to the viewer here is
 * silently invisible to the component under test.
 */
const vetoKey = (id: number) => `movie-${id}`;

async function mockVerdictRoom(page: Page, room: RoomModel) {
  await page.route(/\/rest\/v1\/rpc\//, async (route) => {
    const fn = route.request().url().split('/rpc/')[1]!.split('?')[0]!;
    if (fn === 'court_state_v2' || fn === 'court_state') {
      return route.fulfill({
        json: { ...room, courtSize: 'standard', hostName: room.hostName ?? null, sizeLocked: true },
        headers: { 'content-type': 'application/json' },
      });
    }
    return route.fulfill({ json: null });
  });
}

async function asHost(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('court_host_HARNESS1', token);
    localStorage.setItem('court_part_HARNESS1', 'p-1');
  }, HOST_TOKEN);
}

const TWO_JUROR_WINNER: RoomModel = {
  status: 'verdict',
  participants: [
    { id: 'p-1', name: 'Scott', host: true },
    { id: 'p-2', name: 'Amy', reactions: { [vetoKey(12)]: { r: 'veto' } } },
  ],
  finalists: [
    finalist(1, 11, 'The Quiet Room', [['Scott', 82], ['Amy', 77]]),
    finalist(2, 12, 'Screamfest VII', [['Scott', 40], ['Amy', 35]]),
  ],
  messages: [],
  hostName: 'Scott',
};

test.describe('the reveal reads as a sequence', () => {
  test('jurors flip in first, then vetoes, then the winner resolves last', async ({ page }) => {
    await mockVerdictRoom(page, TWO_JUROR_WINNER);
    await asHost(page);
    await page.goto(HARNESS);

    // The headline withholds the title until the winner has resolved.
    const headline = page.getByTestId('verdict-headline');
    await expect(headline).toContainText('Tallying the votes');
    await expect(page.getByTestId('verdict-winner-pending')).toBeVisible();

    // Jurors flip in one at a time — never all at once.
    const jurors = page.getByTestId('verdict-juror');
    await expect(jurors).toHaveCount(2);
    await expect(jurors.nth(0)).toHaveAttribute('data-revealed', 'true', { timeout: 2000 });
    // The second juror is not yet revealed the instant the first is.
    const secondRevealedEarly = await jurors.nth(1).getAttribute('data-revealed');
    expect(secondRevealedEarly).toBe('false');
    await expect(jurors.nth(1)).toHaveAttribute('data-revealed', 'true', { timeout: 2000 });

    // Vetoed row appears only after both jurors have flipped, named.
    const vetoRow = page.getByTestId('verdict-veto-row');
    await expect(vetoRow).toBeVisible({ timeout: 2000 });
    await expect(vetoRow).toContainText('Screamfest VII');
    await expect(vetoRow).toContainText('vetoed by');

    // The winner resolves LAST — only now does the headline name the title.
    await expect(headline).toContainText('The Quiet Room', { timeout: 3000 });
    await expect(page.getByTestId('verdict-winner-pending')).toHaveCount(0);
    // The exact group-match VALUE is the scoring engine's own math (untouched
    // here, per scope) and already covered by courtRoom.test.ts — this only
    // asserts the number actually rendered, not what it computed to.
    await expect(page.getByTestId('group-match')).toHaveText(/^\d{1,3}$/);

    await page.screenshot({ path: path.join(SHOTS, 'sequence-done.png') });
  });

  test('the share card only appears once the winner has resolved', async ({ page }) => {
    await mockVerdictRoom(page, TWO_JUROR_WINNER);
    await asHost(page);
    await page.goto(HARNESS);
    await expect(page.getByTestId('share-verdict-card')).toHaveCount(0);
    await expect(page.getByTestId('verdict-headline')).toContainText('The Quiet Room', { timeout: 3000 });
    await expect(page.getByTestId('share-verdict-card')).toBeVisible();
  });
});

test.describe('prefers-reduced-motion gives an instant reveal', () => {
  test('everything is visible on the first frame — same content, no wait', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockVerdictRoom(page, TWO_JUROR_WINNER);
    await asHost(page);
    await page.goto(HARNESS);

    // No pending/placeholder state at all under reduced motion.
    await expect(page.getByTestId('verdict-winner-pending')).toHaveCount(0);
    await expect(page.getByTestId('verdict-headline')).toContainText('The Quiet Room');
    const jurors = page.getByTestId('verdict-juror');
    await expect(jurors).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(jurors.nth(i)).toHaveAttribute('data-revealed', 'true');
    await expect(page.getByTestId('verdict-veto-row')).toBeVisible();
    await expect(page.getByTestId('share-verdict-card')).toBeVisible();
  });
});

test.describe('scales to 3 and 5 jurors', () => {
  test('3 jurors, no vetoes — the reveal completes and the winner resolves', async ({ page }) => {
    await mockVerdictRoom(page, {
      status: 'verdict',
      participants: [
        { id: 'p-1', name: 'Scott', host: true },
        { id: 'p-2', name: 'Amy' },
        { id: 'p-3', name: 'Heather' },
      ],
      finalists: [finalist(1, 21, 'Three-Person Pick', [['Scott', 90], ['Amy', 85], ['Heather', 70]])],
      messages: [],
      hostName: 'Scott',
    });
    await asHost(page);
    await page.goto(HARNESS);
    await expect(page.getByTestId('verdict-juror')).toHaveCount(3);
    await expect(page.getByTestId('verdict-veto-reveal')).toHaveCount(0);
    await expect(page.getByTestId('verdict-headline')).toContainText('Three-Person Pick', { timeout: 4000 });
  });

  test('5 jurors, several vetoes — every juror and veto reveals, winner resolves', async ({ page }) => {
    await mockVerdictRoom(page, {
      status: 'verdict',
      // Both vetoes come from participants OTHER than the current viewer
      // (Scott, p-1): the app reads ITS OWN reactions from local optimistic
      // state, not the server's echo of `participants[].reactions` — putting
      // Scott's veto there would be silently ignored by the very code path
      // this test is trying to exercise.
      participants: [
        { id: 'p-1', name: 'Scott', host: true },
        { id: 'p-2', name: 'Amy', reactions: { [vetoKey(32)]: { r: 'veto' } } },
        { id: 'p-3', name: 'Heather', reactions: { [vetoKey(33)]: { r: 'veto' } } },
        { id: 'p-4', name: 'Marcus' },
        { id: 'p-5', name: 'Priya' },
      ],
      finalists: [
        finalist(1, 31, 'Five-Person Pick', [['Scott', 92], ['Amy', 88], ['Heather', 81], ['Marcus', 75], ['Priya', 70]]),
        finalist(2, 32, 'Rejected One', [['Scott', 20], ['Amy', 22], ['Heather', 25], ['Marcus', 21], ['Priya', 19]]),
        finalist(3, 33, 'Rejected Two', [['Scott', 15], ['Amy', 18], ['Heather', 20], ['Marcus', 16], ['Priya', 14]]),
      ],
      messages: [],
      hostName: 'Scott',
    });
    await asHost(page);
    await page.goto(HARNESS);
    await expect(page.getByTestId('verdict-juror')).toHaveCount(5);
    const jurors = page.getByTestId('verdict-juror');
    for (let i = 0; i < 5; i++) await expect(jurors.nth(i)).toHaveAttribute('data-revealed', 'true', { timeout: 6000 });
    const vetoRows = page.getByTestId('verdict-veto-row');
    await expect(vetoRows).toHaveCount(2, { timeout: 8000 });
    await expect(page.getByTestId('verdict-headline')).toContainText('Five-Person Pick', { timeout: 8000 });
  });
});
