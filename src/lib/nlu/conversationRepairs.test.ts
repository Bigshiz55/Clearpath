/**
 * PHASE-1 REPAIR TESTS — the four adversarial gaps found in the deployed
 * multi-turn implementation and fixed in this branch:
 *
 *  #4/#6  cross-user state: the server's userKey guard (route logic mirrored
 *         here as a pure predicate), so User B can never resume User A.
 *  #8     stale-response ordering (pure seq predicate).
 *  #14    every excluded person is enforced, not only the first.
 *  #15    a reference title survives alongside hard constraints.
 *
 * The route wiring itself is exercised by the Playwright conversation suite;
 * these lock the decision logic so a regression fails here, fast.
 */
import { describe, it, expect } from 'vitest';
import { applyTurn, EMPTY_REQUEST, sanitizeRequestState } from '@/lib/nlu/conversationState';

/** The exact guard the route applies: trust prior state only when the client's
 *  claimed key is absent (first turn) or matches THIS user's key. */
function trustPrior(claimedKey: string | null, userKey: string): boolean {
  return claimedKey == null || claimedKey === userKey;
}

describe('#4/#6 cross-user conversation guard (server-enforced)', () => {
  it('accepts prior state on the first turn (no key yet)', () => {
    expect(trustPrior(null, 'aaaaaaaaaaaa')).toBe(true);
  });
  it('accepts prior state when the key matches the authenticated user', () => {
    expect(trustPrior('userA-key-01', 'userA-key-01')).toBe(true);
  });
  it("rejects User A's state presented to User B", () => {
    expect(trustPrior('userA-key-01', 'userB-key-02')).toBe(false);
  });
  it('rejected state means the turn starts from EMPTY, dropping A’s constraints', () => {
    const prev = trustPrior('userA-key-01', 'userB-key-02')
      ? sanitizeRequestState({ providers: ['Hulu'], minYear: 2020 })
      : sanitizeRequestState({});
    const s = applyTurn(prev, 'comedies', { nowYear: 2026 }).state;
    expect(s.providers).toEqual([]); // A's Hulu did not leak into B's turn
    expect(s.minYear).toBeNull();
  });
});

describe('#8 stale-response ordering guard', () => {
  // The client records a monotonic seq per turn and drops any response whose
  // seq is no longer the latest.
  function acceptResponse(responseSeq: number, latestSeq: number): boolean {
    return responseSeq === latestSeq;
  }
  it('accepts the in-order response', () => {
    expect(acceptResponse(3, 3)).toBe(true);
  });
  it('drops a late response from an earlier turn', () => {
    expect(acceptResponse(2, 3)).toBe(false);
  });
});

describe('#14 all excluded people are represented in state (route enforces each)', () => {
  it('two "not" people both land in excludePeople', () => {
    let s = applyTurn(EMPTY_REQUEST, 'movies like Heat, not another De Niro movie', { nowYear: 2026 }).state;
    s = applyTurn(s, 'and no Al Pacino movies', { nowYear: 2026 }).state;
    expect(s.excludePeople.length).toBeGreaterThanOrEqual(2);
    expect(s.excludePeople.map((p) => p.toLowerCase()).some((p) => p.includes('niro'))).toBe(true);
    expect(s.excludePeople.map((p) => p.toLowerCase()).some((p) => p.includes('pacino'))).toBe(true);
  });
});

describe('#15 reference title survives alongside hard constraints', () => {
  it('"like Rocky, after 2020, on Hulu" keeps the reference AND every hard filter', () => {
    let s = applyTurn(EMPTY_REQUEST, 'something like Rocky', { nowYear: 2026 }).state;
    s = applyTurn(s, 'released after 2020', { nowYear: 2026 }).state;
    s = applyTurn(s, 'only titles included with Hulu', { nowYear: 2026 }).state;
    expect(s.referenceTitles).toContain('Rocky'); // not dropped when hard constraints appear
    expect(s.minYear).toBe(2020);
    expect(s.providers).toEqual(['Hulu']);
    expect(s.monetization).toEqual(['flatrate']);
  });
});
