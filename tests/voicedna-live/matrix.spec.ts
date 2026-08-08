import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — THE VOICE DNA LIVE MATRIX. Runs against a real Vercel PREVIEW
 * deployment; see playwright.voicedna.config.ts. Deleted with the preview-only
 * test auth once verification completes.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Matrix rows (serial — shared synthetic identity, stateful server):
 *   A. Founder gate: /voice-dna, /voice-dna/audition, POST /api/voice/session,
 *      and the test-login route itself are all hidden 404s to strangers.
 *   B. Preview-only test login mints a REAL Supabase session.
 *   C. Authed surfaces render; /api/voice/session answers 200 with an honest
 *      mode and never leaks key material.
 *   D. The interview runs end-to-end on the typed ladder: signals advance
 *      confidence, the flagship contradiction is caught, completion reveals DNA.
 *   E. Resume: a reload mid-interview replays the transcript.
 *   F. Session-route hygiene: no-store, no server key in any response.
 *
 * A row-D/E failure whose symptom is "confidence never moves" almost certainly
 * means migration 0047 (voice_interviews) is not applied on the shared
 * database — the already-queued /admin/migrations owner action — and is
 * reported as MIGRATION-BLOCKED rather than a code defect.
 */

// Mirrors src/lib/previewTestAuth.ts (that module is `server-only` and cannot
// be imported here). Worthless off preview deployments.
const TEST_SECRET = process.env.PREVIEW_TEST_SECRET ?? '3df473affcb85ada9aff25464836b0dd949b367527e902e1';
const LOGIN_PATH = '/api/preview-test/founder-login';

/** Answers scripted against the engine's own lexicon: strong, diverse, and
 *  guaranteed to terminate (HARD_TURN_CAP=25) even if confidence stalls. */
const ANSWERS = [
  'I absolutely loved Breaking Bad',
  'I really enjoy crime and mystery',
  'I hate horror',
  'I loved The Silence of the Lambs', // ← flagship contradiction with row 3
  'Christopher Nolan is my all-time favourite',
  'I am a big fan of science fiction',
  'I cannot stand romantic comedy',
  'Pulp Fiction is my absolute favourite',
  'I absolutely loved Gone Girl',
  'I absolutely loved Knives Out',
  'I cannot stand slow burn movies',
  'I absolutely loved Spirited Away',
  'Quentin Tarantino is my favourite',
  'I really enjoy fast paced action',
  'I absolutely loved Se7en',
  'I absolutely loved Blade Runner',
  'I absolutely loved Get Out',
  'I really enjoy mind bending movies',
  'I absolutely loved Die Hard',
  'I absolutely loved Game of Thrones',
  'I absolutely loved La La Land',
  'I absolutely loved 1917',
  'I absolutely loved Fight Club',
  'I absolutely loved No Country for Old Men',
  'I absolutely loved Saving Private Ryan',
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  expect(process.env.VOICE_DNA_PREVIEW_URL, 'VOICE_DNA_PREVIEW_URL must point at the preview deployment').toBeTruthy();
});

/** Sign the browser context in as the synthetic founder-equivalent identity. */
async function loginTestFounder(context: BrowserContext): Promise<void> {
  const res = await context.request.post(LOGIN_PATH, {
    headers: { 'x-preview-test-secret': TEST_SECRET },
  });
  expect(res.status(), 'preview test login must succeed on a preview deployment').toBe(200);
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
}

/**
 * Force the deterministic TYPED ladder in headless Chromium.
 *
 * Only the recognition constructors are removed. That makes `connectFallback`
 * report capability `'typed'`, which is the CAPABILITY path: the client is
 * still constructed and `clientRef` is set, so `submitText()` actually ingests.
 *
 * `speechSynthesis` is deliberately left ALONE. Stubbing it as a getter
 * returning undefined leaves `'speechSynthesis' in window` true, so
 * `connectFallback` throws on `getVoices()` and the component falls through to
 * its ERROR path — which also shows a typed box but with a null client, so
 * every typed answer is silently dropped. Headless Chromium's real
 * `speechSynthesis` reports zero voices, which the transport already handles.
 */
async function forceTypedLadder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      try { delete w[name]; } catch { /* ignore */ }
      try {
        Object.defineProperty(window, name, { value: undefined, configurable: true });
      } catch { /* ignore */ }
    }
  });
}

/** Start the interview and wait for the typed form on the recovery ladder. */
async function startTypedInterview(page: Page): Promise<void> {
  await page.goto('/voice-dna');
  await expect(page.getByTestId('voice-idle')).toBeVisible();
  await page.getByTestId('voice-start').click();
  await expect(page.getByTestId('voice-live')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('voice-typed-form')).toBeVisible({ timeout: 30_000 });
}

async function submitAnswer(page: Page, text: string): Promise<void> {
  await page.fill('#voice-typed-input', text);
  await page.getByTestId('voice-typed-form').locator('button[type="submit"]').click();
  // The turn is serialized through the client's promise chain + a server action.
  await page.waitForTimeout(700);
}

// ── A. The gate: strangers see nothing ──────────────────────────────────────

test('A1 anonymous /voice-dna is a hidden 404', async ({ page }) => {
  const resp = await page.goto('/voice-dna');
  expect(resp?.status()).toBe(404);
});

test('A2 anonymous /voice-dna/audition is a hidden 404', async ({ page }) => {
  const resp = await page.goto('/voice-dna/audition');
  expect(resp?.status()).toBe(404);
});

test('A3 anonymous POST /api/voice/session is a hidden 404', async ({ request }) => {
  const res = await request.post('/api/voice/session');
  expect(res.status()).toBe(404);
});

test('A4 test login without the secret is a hidden 404', async ({ request }) => {
  const noSecret = await request.post(LOGIN_PATH);
  expect(noSecret.status()).toBe(404);
  const wrongSecret = await request.post(LOGIN_PATH, {
    headers: { 'x-preview-test-secret': 'wrong-secret-entirely' },
  });
  expect(wrongSecret.status()).toBe(404);
});

// ── B. The temporary login mints a real session ─────────────────────────────

test('B1 preview test login signs in and sets Supabase auth cookies', async ({ context }) => {
  await loginTestFounder(context);
  const cookies = await context.cookies();
  expect(
    cookies.some((c) => c.name.startsWith('sb-')),
    `expected Supabase auth cookies, saw: ${cookies.map((c) => c.name).join(', ')}`,
  ).toBe(true);
});

// ── C. Authed surfaces ──────────────────────────────────────────────────────

test('C1 authed /voice-dna renders the interview idle screen', async ({ context, page }) => {
  await loginTestFounder(context);
  const resp = await page.goto('/voice-dna');
  expect(resp?.status()).toBe(200);
  await expect(page.getByTestId('voice-idle')).toBeVisible();
  await expect(page.getByTestId('voice-start')).toBeVisible();
});

test('C2 authed /voice-dna/audition renders', async ({ context, page }) => {
  await loginTestFounder(context);
  const resp = await page.goto('/voice-dna/audition');
  expect(resp?.status()).toBe(200);
  const mode = page.getByTestId('audition-mode-realtime').or(page.getByTestId('audition-mode-fallback'));
  await expect(mode.first()).toBeVisible();
});

test('C3 authed /api/voice/session answers 200 with an honest mode', async ({ context }) => {
  await loginTestFounder(context);
  const res = await context.request.post('/api/voice/session');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { mode?: string; client_secret?: unknown };
  expect(['realtime', 'fallback']).toContain(body.mode);
  test.info().annotations.push({ type: 'voice-mode', description: String(body.mode) });
});

// ── D. The interview, end to end on the typed ladder ────────────────────────

/**
 * D0 isolates the CLIENT half of a turn from the SERVER half, so a failure
 * downstream can be attributed without guessing. The user caption is appended
 * by the transport itself, before any server action runs — so if D0 passes and
 * D1 fails, the client and transport are healthy and the loss is strictly
 * server-side persistence (i.e. migration 0047), not a code defect.
 */
test('D0 the typed transport is live and ingests locally', async ({ context, page }) => {
  await loginTestFounder(context);
  await forceTypedLadder(page);
  await startTypedInterview(page);

  await submitAnswer(page, ANSWERS[0]!);
  await expect(
    page.getByTestId('live-captions'),
    'the typed answer never reached the transport — the client fell through to its error path ' +
      '(null client), which is a HARNESS/CLIENT defect and NOT the migration blocker',
  ).toContainText('Breaking Bad');
});

test('D1 typed ladder: signals advance confidence and captions grow', async ({ context, page }) => {
  await loginTestFounder(context);
  await forceTypedLadder(page);
  await startTypedInterview(page);

  await submitAnswer(page, ANSWERS[0]!);
  await submitAnswer(page, ANSWERS[1]!);
  // Client-side proof first: if this fails the transport is broken, not the DB.
  await expect(page.getByTestId('live-captions')).toContainText('Breaking Bad');

  await submitAnswer(page, ANSWERS[4]!);
  const confidence = page.getByTestId('confidence-value');
  const value = Number((await confidence.textContent())?.replace(/\D/g, '') ?? '0');
  expect(
    value,
    'captions grew (client OK) but confidence stayed at 0 after three strong signals — the server ' +
      'turn did not persist. If D0 passed, this is MIGRATION-BLOCKED (0047 voice_interviews absent), ' +
      'not a code defect',
  ).toBeGreaterThan(0);
});

test('D2 the flagship contradiction is caught and surfaced', async ({ context, page }) => {
  await loginTestFounder(context);
  await forceTypedLadder(page);
  await startTypedInterview(page);

  await submitAnswer(page, 'I hate horror');
  await submitAnswer(page, 'I loved The Silence of the Lambs');
  await expect(page.getByTestId('interesting-beat')).toBeVisible({ timeout: 20_000 });
});

test('D3 the interview completes and reveals DNA', async ({ context, page }) => {
  test.setTimeout(300_000);
  await loginTestFounder(context);
  await forceTypedLadder(page);
  await startTypedInterview(page);

  for (const answer of ANSWERS) {
    await submitAnswer(page, answer);
    if (await page.getByTestId('dna-reveal').isVisible().catch(() => false)) break;
  }
  await expect(page.getByTestId('dna-reveal')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('reveal-top-categories')).toBeVisible();
});

// ── E. Resume ───────────────────────────────────────────────────────────────

test('E1 a reload mid-interview resumes with the transcript', async ({ context, page }) => {
  await loginTestFounder(context);
  await forceTypedLadder(page);
  await startTypedInterview(page);

  await submitAnswer(page, 'I absolutely loved Blade Runner');
  await submitAnswer(page, 'I really enjoy crime and mystery');

  await page.reload();
  await expect(page.getByTestId('voice-idle')).toBeVisible();
  await expect(
    page.getByTestId('voice-resume-transcript'),
    'no resume transcript after reload — if turns never persisted, migration 0047 is not applied: MIGRATION-BLOCKED',
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('voice-resume-transcript')).toContainText('Blade Runner');
});

// ── F. Session-route hygiene ────────────────────────────────────────────────

test('F1 /api/voice/session is no-store and never leaks key material', async ({ context }) => {
  await loginTestFounder(context);
  const res = await context.request.post('/api/voice/session');
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');
  const text = await res.text();
  expect(text).not.toMatch(/sk-[A-Za-z0-9]/); // an OpenAI server key shape
  const body = JSON.parse(text) as { mode?: string; client_secret?: { value?: string } };
  if (body.mode === 'realtime') {
    // Ephemeral client secrets are expected; the server key never is.
    expect(body.client_secret?.value ?? '').not.toMatch(/^sk-(?!.*ephemeral)/);
  }
});
