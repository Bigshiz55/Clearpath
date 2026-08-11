import { describe, it, expect } from 'vitest';
import {
  accountFor,
  evaluatePaidCall,
  ingestionIdempotencyKey,
  type PaidCallContext,
} from './paidCallSafety';

/**
 * THE PROOF THAT A PAID CALL CANNOT HAPPEN BY ACCIDENT.
 *
 * The previous integration spent allowance from three trigger paths because
 * nothing could answer whether a call was permitted. These tests are that
 * answer, and the most important one is the exhaustive sweep at the bottom:
 * across every combination of the six inputs, a call is allowed ONLY in the
 * single combination where all six say yes.
 */
const OK: PaidCallContext = {
  adapterId: 'tv_media',
  licensing: 'confirmed',
  configured: true,
  activated: true,
  dryRun: false,
  callsUsedThisMonth: 0,
  monthlyCallLimit: 100,
  intendedCalls: 1,
  holdsLock: true,
};

describe('evaluatePaidCall — the refusals', () => {
  it('allows only when everything lines up', () => {
    const d = evaluatePaidCall(OK);
    expect(d.allowed).toBe(true);
    expect(d.remainingAfter).toBe(99);
  });

  it('LICENSING OUTRANKS EVERYTHING — unconfirmed blocks a fully enabled provider', () => {
    for (const licensing of ['unconfirmed', 'rejected'] as const) {
      const d = evaluatePaidCall({ ...OK, licensing });
      expect(d.allowed, licensing).toBe(false);
      expect(d.code).toBe('licensing_not_confirmed');
      // Named as a licence problem, not a config problem — nobody should be
      // able to "fix" this by setting a flag.
      expect(d.reason).toMatch(/credential is not permission/i);
    }
  });

  it('a credential is never permission on its own', () => {
    const d = evaluatePaidCall({ ...OK, licensing: 'unconfirmed', configured: true, activated: true });
    expect(d.allowed).toBe(false);
  });

  it('DRY RUN costs nothing, even fully licensed and activated', () => {
    const d = evaluatePaidCall({ ...OK, dryRun: true });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('dry_run');
  });

  it('activation is separate from configuration', () => {
    expect(evaluatePaidCall({ ...OK, activated: false }).code).toBe('not_activated');
    // …and being activated does not substitute for having a key.
    expect(evaluatePaidCall({ ...OK, configured: false }).code).toBe('not_configured');
  });

  it('a caller without the lock never spends — one authoritative path', () => {
    const d = evaluatePaidCall({ ...OK, holdsLock: false });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('concurrent_run');
  });

  it('refuses at the ceiling rather than at the invoice', () => {
    expect(evaluatePaidCall({ ...OK, callsUsedThisMonth: 100 }).code).toBe('budget_exhausted');
    expect(evaluatePaidCall({ ...OK, callsUsedThisMonth: 99, intendedCalls: 2 }).code).toBe('budget_exhausted');
    // Exactly at the limit is allowed; one past it is not.
    expect(evaluatePaidCall({ ...OK, callsUsedThisMonth: 99, intendedCalls: 1 }).allowed).toBe(true);
  });

  it('reports remaining allowance on a denial too, so an operator can see the ceiling', () => {
    const d = evaluatePaidCall({ ...OK, callsUsedThisMonth: 97, intendedCalls: 10 });
    expect(d.allowed).toBe(false);
    expect(d.remainingAfter).toBe(3);
  });

  it('never leaks anything key-shaped in a reason', () => {
    for (const ctx of [OK, { ...OK, licensing: 'rejected' as const }, { ...OK, configured: false }]) {
      expect(evaluatePaidCall(ctx).reason).not.toMatch(/[A-Za-z0-9_-]{24,}/);
    }
  });
});

describe('EXHAUSTIVE — no accidental path to a paid call', () => {
  it('across every combination, only the all-yes case spends', () => {
    const bools = [false, true];
    let allowed = 0;
    let total = 0;
    for (const licensingOk of bools)
      for (const configured of bools)
        for (const activated of bools)
          for (const dryRun of bools)
            for (const holdsLock of bools)
              for (const inBudget of bools) {
                total += 1;
                const d = evaluatePaidCall({
                  ...OK,
                  licensing: licensingOk ? 'confirmed' : 'unconfirmed',
                  configured,
                  activated,
                  dryRun,
                  holdsLock,
                  callsUsedThisMonth: inBudget ? 0 : 100,
                });
                if (d.allowed) {
                  allowed += 1;
                  // If it allowed, every gate must genuinely have been open.
                  expect(licensingOk && configured && activated && !dryRun && holdsLock && inBudget).toBe(true);
                }
              }
    expect(total).toBe(64);
    expect(allowed, 'more than one combination permitted a paid call').toBe(1);
  });
});

describe('accountFor', () => {
  it('counts a FAILED call against the allowance — the provider bills the request', () => {
    const a = accountFor(10, 100, ['completed', 'failed', 'completed']);
    expect(a).toEqual({ attempted: 3, completed: 2, failed: 1, remaining: 87 });
  });

  it('never reports negative remaining', () => {
    expect(accountFor(99, 100, ['failed', 'failed', 'failed']).remaining).toBe(0);
  });

  it('an uncapped allowance reports null rather than guessing a number', () => {
    expect(accountFor(5, null, ['completed']).remaining).toBeNull();
  });
});

describe('ingestionIdempotencyKey', () => {
  const base = { adapterId: 'tv_media', lineupId: 'us-east', windowStartMs: Date.UTC(2026, 7, 11, 13, 0), windowEndMs: Date.UTC(2026, 7, 11, 19, 0) };

  it('a cron firing and a retry seven minutes later are ONE unit of work', () => {
    const cron = ingestionIdempotencyKey(base);
    const retry = ingestionIdempotencyKey({ ...base, windowStartMs: base.windowStartMs + 7 * 60_000 });
    expect(retry).toBe(cron);
  });

  it('different windows, lineups or adapters are different work', () => {
    const k = ingestionIdempotencyKey(base);
    expect(ingestionIdempotencyKey({ ...base, lineupId: 'us-west' })).not.toBe(k);
    expect(ingestionIdempotencyKey({ ...base, adapterId: 'tvmaze' })).not.toBe(k);
    expect(ingestionIdempotencyKey({ ...base, windowStartMs: base.windowStartMs + 6 * 3_600_000 })).not.toBe(k);
  });
});
