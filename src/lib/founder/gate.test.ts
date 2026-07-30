import { describe, it, expect, beforeEach } from 'vitest';
import { mintToken, verifyToken, secretEquals, cookieOptions, SESSION_TTL_SECONDS } from './gate';
import {
  evaluate, withFailure, checkAttempts, recordFailure, clearAttempts, _resetAll,
  MAX_FAILURES, LOCKOUT_MS, WINDOW_MS,
} from './attempts';

const CODE = 'a-sufficiently-long-test-code-0123456789';

describe('founder session token', () => {
  it('round-trips a token that was signed with the same code', () => {
    const payload = verifyToken(mintToken(CODE), CODE);
    expect(payload).not.toBeNull();
    expect(payload!.exp - payload!.iat).toBe(SESSION_TTL_SECONDS);
    expect(payload!.jti).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rejects a token signed with a DIFFERENT code — rotating the code revokes sessions', () => {
    const token = mintToken(CODE);
    expect(verifyToken(token, 'a-different-code-that-is-long-enough')).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = mintToken(CODE);
    const [v, body, sig] = token.split('.') as [string, string, string];
    // Re-encode a payload that grants a far-future expiry, keeping the old sig.
    const forged = Buffer.from(JSON.stringify({ iat: 1, exp: 9_999_999_999, jti: 'x'.repeat(32) })).toString('base64url');
    expect(verifyToken(`${v}.${forged}.${sig}`, CODE)).toBeNull();
    // Flipping a byte of the signature is equally fatal.
    expect(verifyToken(`${v}.${body}.${sig.slice(0, -2)}AA`, CODE)).toBeNull();
  });

  it('rejects malformed, empty and wrong-version tokens without throwing', () => {
    for (const bad of ['', 'nonsense', 'a.b', 'a.b.c.d', 'v2.x.y', '..']) {
      expect(verifyToken(bad, CODE), bad).toBeNull();
    }
    expect(verifyToken(undefined, CODE)).toBeNull();
  });

  it('rejects an expired token', () => {
    const now = 1_000_000;
    const token = mintToken(CODE, now);
    expect(verifyToken(token, CODE, now + SESSION_TTL_SECONDS - 1)).not.toBeNull();
    expect(verifyToken(token, CODE, now + SESSION_TTL_SECONDS)).toBeNull();
    expect(verifyToken(token, CODE, now + SESSION_TTL_SECONDS + 1)).toBeNull();
  });

  it('rejects a token issued implausibly far in the future', () => {
    const now = 1_000_000;
    expect(verifyToken(mintToken(CODE, now + 10_000), CODE, now)).toBeNull();
  });

  it('mints a fresh session id every time — a stale cookie cannot be promoted', () => {
    const a = verifyToken(mintToken(CODE), CODE)!;
    const b = verifyToken(mintToken(CODE), CODE)!;
    expect(a.jti).not.toBe(b.jti);
  });

  it('never embeds the code in the token', () => {
    expect(mintToken(CODE)).not.toContain(CODE);
    const [, body] = mintToken(CODE).split('.') as [string, string];
    expect(Buffer.from(body, 'base64url').toString('utf8')).not.toContain(CODE);
  });

  it('verifies with no code configured by refusing, not by allowing', () => {
    expect(verifyToken(mintToken(CODE), '')).toBeNull();
  });
});

describe('constant-time comparison', () => {
  it('matches identical values and rejects near-misses', () => {
    expect(secretEquals('abc123', 'abc123')).toBe(true);
    expect(secretEquals('abc123', 'abc124')).toBe(false);
  });

  it('handles different lengths without throwing — the digest is fixed width', () => {
    expect(secretEquals('short', 'a-much-longer-value')).toBe(false);
    expect(secretEquals('', 'x')).toBe(false);
    expect(secretEquals('', '')).toBe(true);
  });
});

describe('cookie options', () => {
  it('is HttpOnly, SameSite=Strict, scoped to the site, and short-lived', () => {
    const o = cookieOptions(true);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe('strict');
    expect(o.path).toBe('/');
    expect(o.maxAge).toBe(4 * 60 * 60);
  });

  it('is Secure in production and only relaxed for local http', () => {
    expect(cookieOptions(true).secure).toBe(true);
    expect(cookieOptions(false).secure).toBe(false);
  });
});

describe('failed-attempt policy', () => {
  beforeEach(() => _resetAll());

  it('allows the first attempt and counts down', () => {
    expect(evaluate(undefined, 0).remaining).toBe(MAX_FAILURES);
    let state = withFailure(undefined, 0);
    expect(evaluate(state, 0).remaining).toBe(MAX_FAILURES - 1);
    state = withFailure(state, 0);
    expect(evaluate(state, 0).remaining).toBe(MAX_FAILURES - 2);
  });

  it('locks out after the limit and reports how long', () => {
    let state = withFailure(undefined, 0);
    for (let i = 1; i < MAX_FAILURES; i++) state = withFailure(state, 0);
    const v = evaluate(state, 0);
    expect(v.allowed).toBe(false);
    expect(v.lockedUntil).toBe(LOCKOUT_MS);
    expect(v.retryAfterSeconds).toBe(LOCKOUT_MS / 1000);
  });

  it('releases the lockout once it expires', () => {
    let state = withFailure(undefined, 0);
    for (let i = 1; i < MAX_FAILURES; i++) state = withFailure(state, 0);
    expect(evaluate(state, LOCKOUT_MS - 1).allowed).toBe(false);
    expect(evaluate(state, LOCKOUT_MS + 1).allowed).toBe(true);
  });

  it('forgets isolated failures once the window passes', () => {
    const state = withFailure(undefined, 0);
    expect(evaluate(state, WINDOW_MS + 1).remaining).toBe(MAX_FAILURES);
  });

  it('tracks clients independently through the store', () => {
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure('client-a');
    expect(checkAttempts('client-a').allowed).toBe(false);
    expect(checkAttempts('client-b').allowed).toBe(true);
  });

  it('clears a client on success, so a good code restores the budget', () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('client-c');
    clearAttempts('client-c');
    expect(checkAttempts('client-c').remaining).toBe(MAX_FAILURES);
  });
});
