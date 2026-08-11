/**
 * PAID-CALL SAFETY — every reason a metered provider may NOT be called, in one
 * place, evaluated in a fixed order.
 *
 * This exists because of what happened: the previous TV Media integration
 * "consumed allowance from three trigger paths with nothing able to answer
 * whether a call was permitted" (see `tv/sources/feasibility.ts`). Three
 * callers, three implicit policies, one bill. The lesson is not "add a flag" —
 * the flags were there — it is that permission was never a single answerable
 * question.
 *
 * `evaluatePaidCall` is that question. It is pure, total, and returns a REASON
 * whether it allows or denies, so a caller can log why it spent as easily as
 * why it didn't.
 *
 * THE ORDER IS THE POLICY, and it is deliberate:
 *
 *   1. licensing        — a credential is not permission. This outranks every
 *                         operational flag, so no amount of enabling can call a
 *                         source we are not licensed to call.
 *   2. dry run          — a rehearsal must cost nothing, ever.
 *   3. activation       — an explicit production activation state, SEPARATE
 *                         from "configured" and from "enabled". Three keys, not
 *                         one, because each previously meant something else to
 *                         somebody.
 *   4. credentials      — checked AFTER permission so a missing key can never
 *                         be reported as the reason a licensed call failed.
 *   5. budget           — the monthly allowance, refused at the ceiling rather
 *                         than at the invoice.
 *   6. concurrency      — one authoritative ingestion path; a second caller
 *                         holding no lock is refused outright.
 *
 * Pure: no I/O, no clock, no env reads, no secrets. The caller supplies facts.
 */
import type { LicensingStatus } from './providerHealth';

export type PaidCallDenialCode =
  | 'licensing_not_confirmed'
  | 'dry_run'
  | 'not_activated'
  | 'not_configured'
  | 'budget_exhausted'
  | 'concurrent_run';

export interface PaidCallDecision {
  allowed: boolean;
  code: PaidCallDenialCode | 'allowed';
  /** One sentence, safe to log and to show an operator. Never contains a key. */
  reason: string;
  /** Calls remaining after this one would be made (null when uncapped). */
  remainingAfter: number | null;
}

export interface PaidCallContext {
  adapterId: string;
  licensing: LicensingStatus;
  /** Credentials present. */
  configured: boolean;
  /**
   * The explicit production activation state. Deliberately distinct from
   * `configured` (a key exists) and from a mode flag: activation is a decision
   * someone made about THIS provider in THIS environment.
   */
  activated: boolean;
  /** A rehearsal. Must never produce a paid call. */
  dryRun: boolean;
  /** Calls already made this month against the allowance. */
  callsUsedThisMonth: number;
  /** The allowance. `null` = uncapped, which we still refuse to assume. */
  monthlyCallLimit: number | null;
  /** How many calls this operation intends to make. */
  intendedCalls: number;
  /** Does THIS caller hold the ingestion lock? */
  holdsLock: boolean;
}

/** The one question: may this adapter make `intendedCalls` paid calls now? */
export function evaluatePaidCall(ctx: PaidCallContext): PaidCallDecision {
  const remaining = ctx.monthlyCallLimit == null ? null : Math.max(0, ctx.monthlyCallLimit - ctx.callsUsedThisMonth);

  if (ctx.licensing !== 'confirmed') {
    return {
      allowed: false,
      code: 'licensing_not_confirmed',
      reason: `${ctx.adapterId}: licensing is ${ctx.licensing}. A credential is not permission — no paid call may be made until the licence is confirmed in writing.`,
      remainingAfter: remaining,
    };
  }
  if (ctx.dryRun) {
    return {
      allowed: false,
      code: 'dry_run',
      reason: `${ctx.adapterId}: dry run — planning only, zero paid calls.`,
      remainingAfter: remaining,
    };
  }
  if (!ctx.activated) {
    return {
      allowed: false,
      code: 'not_activated',
      reason: `${ctx.adapterId}: not activated for this environment. Activation is a separate, explicit decision from being configured.`,
      remainingAfter: remaining,
    };
  }
  if (!ctx.configured) {
    return {
      allowed: false,
      code: 'not_configured',
      reason: `${ctx.adapterId}: no credentials configured.`,
      remainingAfter: remaining,
    };
  }
  if (!ctx.holdsLock) {
    return {
      allowed: false,
      code: 'concurrent_run',
      reason: `${ctx.adapterId}: another ingestion holds the lock. One authoritative path only — a second caller never spends.`,
      remainingAfter: remaining,
    };
  }
  if (ctx.intendedCalls <= 0) {
    return { allowed: true, code: 'allowed', reason: `${ctx.adapterId}: nothing to fetch.`, remainingAfter: remaining };
  }
  if (remaining != null && ctx.intendedCalls > remaining) {
    return {
      allowed: false,
      code: 'budget_exhausted',
      reason: `${ctx.adapterId}: ${ctx.intendedCalls} call(s) requested but only ${remaining} left of ${ctx.monthlyCallLimit} this month.`,
      remainingAfter: remaining,
    };
  }
  return {
    allowed: true,
    code: 'allowed',
    reason: `${ctx.adapterId}: permitted — licensed, activated, in budget, holding the lock.`,
    remainingAfter: remaining == null ? null : remaining - ctx.intendedCalls,
  };
}

/** Running account of what an activation actually spent. */
export interface CallAccount {
  attempted: number;
  completed: number;
  failed: number;
  remaining: number | null;
}

export function accountFor(
  used: number,
  limit: number | null,
  outcomes: readonly ('completed' | 'failed')[],
): CallAccount {
  const completed = outcomes.filter((o) => o === 'completed').length;
  const failed = outcomes.length - completed;
  return {
    attempted: outcomes.length,
    completed,
    failed,
    /* FAILED CALLS STILL COST. A provider bills the request, not the parse, so
       counting only successes is how an allowance quietly disappears. */
    remaining: limit == null ? null : Math.max(0, limit - used - outcomes.length),
  };
}

/**
 * The idempotency key for one lineup/time-window ingestion.
 *
 * Two triggers that mean the same fetch must produce the same key, so a retry,
 * a manual run and a cron firing in the same window are one unit of work rather
 * than three bills. Windows are floored to the hour: a cron at :00 and a retry
 * at :07 are the same intent.
 */
export function ingestionIdempotencyKey(input: {
  adapterId: string;
  lineupId: string;
  windowStartMs: number;
  windowEndMs: number;
}): string {
  const hour = 3_600_000;
  const start = Math.floor(input.windowStartMs / hour) * hour;
  const end = Math.ceil(input.windowEndMs / hour) * hour;
  return `${input.adapterId}:${input.lineupId}:${start}:${end}`;
}
