/**
 * FAILED-ATTEMPT TRACKING for the founder access code (pure logic + one
 * in-process store).
 *
 * HONEST LIMITATION, stated here because it matters: the store is per-instance
 * memory. On serverless, a determined attacker who can reach several warm
 * instances gets several independent budgets, and a cold start resets one.
 * That is a real weakening, not a theoretical one.
 *
 * It is still worth having, and it is not the only defence:
 *   * Every attempt — right or wrong — pays a fixed delay, which caps the rate
 *     an instance will answer at all. That bound is per-instance too, but it
 *     applies to the attacker's fastest path rather than to their bookkeeping.
 *   * The code itself is expected to carry the entropy. A 6-character code is
 *     not safe behind ANY rate limiter; a 32-character random one is not worth
 *     brute-forcing even without one.
 *
 * When a shared store is available (Redis, or the Postgres this repo already
 * has once migrations land), swap `recordFailure`/`checkAttempts` for it — the
 * shape is deliberately storage-agnostic.
 */

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const WINDOW_MS = 15 * 60 * 1000;
/** Every submission costs at least this, correct or not. */
export const MIN_ATTEMPT_MS = 400;

export interface AttemptState {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
}

export interface AttemptVerdict {
  allowed: boolean;
  /** Remaining attempts before lockout; null once locked. */
  remaining: number | null;
  lockedUntil: number | null;
  retryAfterSeconds: number;
}

const store = new Map<string, AttemptState>();

/** Bound memory: this is a single-founder gate, not a user directory. */
const MAX_TRACKED_KEYS = 5_000;

/** Pure: decide from a state, so the policy is testable without the store. */
export function evaluate(state: AttemptState | undefined, now: number): AttemptVerdict {
  if (!state) return { allowed: true, remaining: MAX_FAILURES, lockedUntil: null, retryAfterSeconds: 0 };

  if (state.lockedUntil && state.lockedUntil > now) {
    return {
      allowed: false,
      remaining: null,
      lockedUntil: state.lockedUntil,
      retryAfterSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }
  // The window has passed, or the lockout expired: start clean.
  if (now - state.firstFailureAt > WINDOW_MS || (state.lockedUntil && state.lockedUntil <= now)) {
    return { allowed: true, remaining: MAX_FAILURES, lockedUntil: null, retryAfterSeconds: 0 };
  }
  return {
    allowed: true,
    remaining: Math.max(0, MAX_FAILURES - state.failures),
    lockedUntil: null,
    retryAfterSeconds: 0,
  };
}

/** Pure: fold one failure into a state. */
export function withFailure(state: AttemptState | undefined, now: number): AttemptState {
  if (!state || now - state.firstFailureAt > WINDOW_MS || (state.lockedUntil && state.lockedUntil <= now)) {
    return { failures: 1, firstFailureAt: now, lockedUntil: null };
  }
  const failures = state.failures + 1;
  return {
    failures,
    firstFailureAt: state.firstFailureAt,
    lockedUntil: failures >= MAX_FAILURES ? now + LOCKOUT_MS : null,
  };
}

export function checkAttempts(key: string, now = Date.now()): AttemptVerdict {
  return evaluate(store.get(key), now);
}

export function recordFailure(key: string, now = Date.now()): AttemptVerdict {
  if (store.size > MAX_TRACKED_KEYS) store.clear();
  const next = withFailure(store.get(key), now);
  store.set(key, next);
  return evaluate(next, now);
}

export function clearAttempts(key: string): void {
  store.delete(key);
}

/** Test-only. */
export function _resetAll(): void {
  store.clear();
}
