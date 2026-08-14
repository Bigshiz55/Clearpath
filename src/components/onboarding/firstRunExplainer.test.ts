/**
 * THE FIRST-RUN EXPLAINER'S CONTRACT, PINNED AT THE SOURCE.
 *
 * Source-level for the same reason quizReachable.test.ts is: `/app` redirects
 * to login without a session, so a browser test would pass against a login
 * screen and prove nothing about who sees the explainer or where its buttons
 * go.
 *
 * The three promises that must not drift:
 *   1. ONLY the genuinely-unbuilt see it — the server gates on a real
 *      preference-signal count, failing OPEN to "has DNA" so an error can
 *      never nag a veteran.
 *   2. Skip is deferral (sessionStorage); Don't-show-again is a decision
 *      (localStorage). Collapsing the two into one key would turn "not right
 *      now" into "never", silently.
 *   3. The primary action goes to the one canonical quiz and counts as done.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('who sees the explainer', () => {
  it('the app home renders it only for a user with zero preference signal', () => {
    const page = read('src/app/app/page.tsx');
    expect(page).toContain('{firstRun && <FirstRunExplainer />}');
    expect(page).toContain("from('preference_events')");
    // Fail-open to "has DNA": both the error branch and the catch must leave
    // firstRun false, so a database hiccup shows nothing.
    expect(page).toContain('firstRun = !error && (count ?? 0) === 0');
    expect(page).toMatch(/catch\s*\{\s*firstRun = false/);
  });
});

describe('the two kinds of no', () => {
  const cmp = read('src/components/onboarding/FirstRunExplainer.tsx');

  it('skip is a deferral — session-scoped, back next visit', () => {
    expect(cmp).toContain("const SKIP_KEY = 'wv.firstrun.skipped.session'");
    expect(cmp).toMatch(/sessionStorage\.setItem\(SKIP_KEY/);
    // Skip must never write the permanent key.
    const skipFn = cmp.slice(cmp.indexOf('function skip'), cmp.indexOf('function done'));
    expect(skipFn).not.toContain('localStorage');
  });

  it("don't-show-again is a decision — permanent, like the other hints", () => {
    expect(cmp).toContain("const DONE_KEY = 'wv.firstrun.done.v1'");
    expect(cmp).toMatch(/localStorage\.setItem\(DONE_KEY/);
  });

  it('both keys are honoured before showing anything', () => {
    expect(cmp).toMatch(/localStorage\.getItem\(DONE_KEY\)/);
    expect(cmp).toMatch(/sessionStorage\.getItem\(SKIP_KEY\)/);
  });
});

describe('what it says and where it goes', () => {
  const cmp = read('src/components/onboarding/FirstRunExplainer.tsx');

  it('carries the sixty-second promise', () => {
    expect(cmp).toContain('60 seconds');
    expect(cmp.toLowerCase()).toContain('build your dna');
  });

  it('the primary action is the canonical quiz, and taking it counts as done', () => {
    expect(cmp).toContain('href="/app/taste-quiz"');
    expect(cmp).toMatch(/href="\/app\/taste-quiz" onClick=\{done\}/);
  });

  it('exposes the three controls for a journey test', () => {
    for (const id of ['first-run-explainer', 'first-run-start', 'first-run-skip', 'first-run-never']) {
      expect(cmp).toContain(`data-testid="${id}"`);
    }
  });
});
