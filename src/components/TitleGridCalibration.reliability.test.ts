/**
 * RELIABILITY SPRINT — the canonical Watch DNA quiz must never hang, never
 * silently discard picks, and must be honest about progress toward
 * personalization.
 *
 * `/app/taste-quiz` sits behind auth (redirects to /login with no session),
 * so a browser test asserting these behaviors would pass against a login
 * screen and prove nothing — same reasoning as quizReachable.test.ts.
 * Source-level instead: each gap below was a confirmed, specific defect
 * (audited before this fix), and each assertion pins the fix, not just the
 * feature's existence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const grid = () => read('src/components/TitleGridCalibration.tsx');

describe('no request can hang the loading state forever', () => {
  it('every /api/calibration fetch is bounded by an AbortController timeout', () => {
    const src = grid();
    expect(src).toContain('FETCH_TIMEOUT_MS');
    expect(src).toContain('AbortController');
    expect(src).toContain('fetchWithTimeout');
    // The retry loop must actually use the bounded fetch, not a bare fetch().
    expect(src).toMatch(/fetchWithTimeout\(`\/api\/calibration/);
  });

  it('an aborted request produces a specific, actionable error message, not a silent hang', () => {
    const src = grid();
    expect(src).toContain("e.name === 'AbortError'");
    expect(src).toMatch(/took too long/i);
  });
});

describe('a failed load always offers a way forward, not a dead end', () => {
  it('the error state renders an explicit Retry control', () => {
    const src = grid();
    expect(src).toContain('data-testid="title-grid-retry"');
    expect(src).toMatch(/onClick=\{?\(?\)?\s*=>\s*void load\(\)/);
  });

  it('the true-empty state (not just "everything is exhausted") also offers Try again', () => {
    const src = grid();
    const emptyBlock = src.slice(src.indexOf('title-grid-empty'), src.indexOf('title-grid-empty') + 800);
    expect(emptyBlock).toMatch(/Try again/);
  });
});

describe('unsaved picks survive a refresh', () => {
  it('picks are mirrored to localStorage as they happen, not only on submit', () => {
    const src = grid();
    expect(src).toContain('function saveDraft');
    expect(src).toContain('localStorage.setItem');
    // Must fire on every pick change, not just once.
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(Object\.keys\(picks\)\.length === 0\)/);
  });

  it('a saved draft is restored on mount, before the first paint of empty state', () => {
    const src = grid();
    expect(src).toContain('function loadDraft');
    expect(src).toContain('localStorage.getItem');
    expect(src).toContain('setRestoredDraft');
  });

  it('the draft is cleared once every picked title actually saves — never left to resurrect stale data', () => {
    const src = grid();
    expect(src).toContain('function clearDraft');
    expect(src).toContain('localStorage.removeItem');
    expect(src).toMatch(/clearDraft\(sessionId\)/);
  });

  it('the footer copy is honest: not-yet-submitted, but refresh-safe — not "nothing is saved"', () => {
    const src = grid();
    expect(src).not.toContain('nothing is saved until you finish');
    expect(src).toMatch(/won&rsquo;t lose them/);
  });
});

describe('retries are idempotent, never double-write', () => {
  it('every pick carries a stable id assigned at tap time, not a fresh random id per submit', () => {
    const src = grid();
    // Pick variants all carry `id`, and it's set once (uid()) when the tile
    // is tapped, not regenerated inside submit().
    expect(src).toMatch(/\{ kind: 'like'; id: string \}/);
    expect(src).toMatch(/next\[k\] = \{ kind: 'like', id: uid\(\) \}/);
    expect(src).toContain('eventId: pick.id');
  });
});

describe('a partial save failure is never silently under-reported', () => {
  it('failed picks stay in `picks` and get an explicit retry action, distinct from the load-retry', () => {
    const src = grid();
    expect(src).toContain('data-testid="title-grid-save-issue"');
    expect(src).toContain('data-testid="title-grid-retry-save"');
    expect(src).toContain('setSaveIssue');
  });

  it('a total failure and a partial failure get different, specific copy — never a bare lower count', () => {
    const src = grid();
    expect(src).toMatch(/failed\.length === toSend\.length/);
    expect(src).toMatch(/couldn.t be saved/i);
  });

  it('the done/payoff screen is never shown when any pick failed to save', () => {
    const src = grid();
    const submitFn = src.slice(src.indexOf('async function submit'), src.indexOf('async function submit') + 3000);
    expect(submitFn).toMatch(/if \(failed\.length > 0\) \{[\s\S]*?return;/);
  });
});

describe('progress and the personalization unlock are honest, sourced from the server', () => {
  it('progress is read from the server\'s own calibrationProgress model, never re-derived client-side', () => {
    const src = grid();
    expect(src).toContain('data.progress');
    expect(src).toContain('setProgress(data.progress)');
  });

  it('the unlock threshold shown matches the app-wide EARLY_COMPLETE constant, not a hardcoded number', () => {
    const src = grid();
    expect(src).toContain("from '@/lib/preference/calibration'");
    expect(src).toContain('EARLY_COMPLETE');
  });

  it('an unlock banner only renders once the server actually says reachedEarly, not on an assumption', () => {
    const src = grid();
    expect(src).toContain('data-testid="personalization-unlocked"');
    expect(src).toMatch(/progress\?\.reachedEarly\s*&&/);
  });
});
