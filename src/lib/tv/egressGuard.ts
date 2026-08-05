import 'server-only';
import {
  mayCallUpstream, currentDataMode, type AdapterCostClass, type EgressDecision,
} from './dataMode';

/**
 * THE ONE DOOR TO THE OUTSIDE WORLD.
 *
 * Every adapter that can make an upstream request goes through this, and the
 * point is not politeness — it is that "did anything call TV Media today?"
 * became an unanswerable question. Three separate triggers (an hourly GitHub
 * workflow, a daily Vercel cron, and a callable route) all reached the same
 * metered adapter, and no single place in the code could say yes or no.
 *
 * Now there is one place. It:
 *
 *   1. asks the data-mode gate whether this adapter may spend anything,
 *   2. records the decision either way, and
 *   3. escalates a DENIED metered call to a CRITICAL log line — because an
 *      adapter reaching this door when it should not have is a defect in the
 *      caller, and silence is how the previous allowance disappeared.
 *
 * A denial is not an error for the caller to swallow. It returns a typed
 * decision, and adapters must render it as an honest "not configured / not
 * enabled" state rather than an empty result that looks like "nothing is on".
 */

export type EgressAttempt = {
  adapterId: string;
  cost: AdapterCostClass;
  /** Why this call is being made — 'cron', 'admin', 'backfill', 'health'. */
  trigger: string;
  /** Coarse target for the log; never a full URL with a key in it. */
  target: string;
};

export type EgressRecord = EgressAttempt & {
  at: string;
  decision: EgressDecision;
  vercelEnv: string | null;
};

/**
 * In-process ring buffer. The durable record is `tv_upstream_requests`; this
 * is what `/api/health/tv` can read without a database round-trip, and what
 * a test can assert against without one either.
 */
const RING_LIMIT = 200;
const ring: EgressRecord[] = [];

export function recentEgress(limit = 50): EgressRecord[] {
  return ring.slice(-limit).reverse();
}

/** Test seam — the ring is module state and must not leak between tests. */
export function __resetEgressLog(): void {
  ring.length = 0;
}

/**
 * TEST SEAM — "the transport is a stub, not the internet".
 *
 * Adapter suites replace `global.fetch` and then exercise the adapter's
 * parsing and error-mapping contract. Those tests are not reaching a live
 * source, but the guard cannot see the difference between a stubbed transport
 * and a real one, and refusing them would mean the only way to test an
 * adapter's behaviour is to remove its gate.
 *
 * So the test says so, out loud, in the test file. Three properties make this
 * safe rather than a hole:
 *
 *   - it is off by default and must be turned on per suite;
 *   - `egressContract.test.ts` asserts no non-test source file references it;
 *   - a record is still written, tagged, so a suite that forgets to turn it
 *     back off is visible rather than silent.
 */
let transportIsStubbed = false;

export function __stubTransportForTest(on: boolean): void {
  transportIsStubbed = on;
}

export function egressCounts(): { allowed: number; denied: number; byAdapter: Record<string, { allowed: number; denied: number }> } {
  const byAdapter: Record<string, { allowed: number; denied: number }> = {};
  let allowed = 0;
  let denied = 0;
  for (const r of ring) {
    byAdapter[r.adapterId] ??= { allowed: 0, denied: 0 };
    if (r.decision.allowed) { allowed++; byAdapter[r.adapterId]!.allowed++; }
    else { denied++; byAdapter[r.adapterId]!.denied++; }
  }
  return { allowed, denied, byAdapter };
}

/**
 * Ask permission. Always call this BEFORE the first `fetch`, never after.
 */
export function requestEgress(attempt: EgressAttempt): EgressDecision {
  const decision: EgressDecision = transportIsStubbed
    ? { allowed: true, mode: currentDataMode() }
    : mayCallUpstream({ adapterId: attempt.adapterId, cost: attempt.cost });
  const record: EgressRecord = {
    ...attempt,
    trigger: transportIsStubbed ? `${attempt.trigger}[stubbed-transport]` : attempt.trigger,
    at: new Date().toISOString(),
    decision,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  };
  ring.push(record);
  if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);

  if (!decision.allowed && attempt.cost === 'metered') {
    // A metered adapter reaching the door it is not allowed through means a
    // caller believed it was permitted. That is the exact class of mistake
    // that quietly drained the previous allowance, so it is CRITICAL and it
    // names the caller.
    console.error(
      '[CRITICAL][tv-egress] metered adapter was invoked while not authorised — ' +
        JSON.stringify({
          adapterId: attempt.adapterId,
          trigger: attempt.trigger,
          target: attempt.target,
          mode: decision.mode,
          code: decision.code,
          vercelEnv: record.vercelEnv,
        }),
    );
  }
  return decision;
}

/**
 * Convenience for adapters: a denial rendered as the shape callers already
 * understand, so a blocked adapter reports WHY rather than returning nothing.
 */
export function egressDenialSummary(decision: EgressDecision): string {
  return decision.allowed ? '' : `${decision.code}: ${decision.reason}`;
}
