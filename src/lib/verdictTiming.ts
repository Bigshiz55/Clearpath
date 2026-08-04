'use client';

/**
 * TIME FROM HOMEPAGE ARRIVAL TO FIRST SUCCESSFUL VERD1CT.
 *
 * `markHomepageArrival` stamps the moment someone lands on the homepage;
 * `reportFirstVerdictShown` reads it back the first time a Verdict actually
 * renders and reports the gap. Both are session-scoped and idempotent — a
 * visitor who reloads the homepage, or sees a second Verdict later in the
 * same tab, does not re-stamp or re-report. If there is no arrival stamp
 * (private browsing blocked storage, or the Verdict was reached some other
 * way) this reports nothing rather than inventing a number.
 */
import { reportReliabilityEvent } from '@/lib/monitoringClient';

const ARRIVAL_KEY = 'wv.homeArrivalTs';
const REPORTED_KEY = 'wv.firstVerdictReported';

export function markHomepageArrival(): void {
  try {
    if (sessionStorage.getItem(ARRIVAL_KEY)) return;
    sessionStorage.setItem(ARRIVAL_KEY, String(Date.now()));
  } catch {
    /* private mode / quota — timing just won't be measurable this session */
  }
}

export function reportFirstVerdictShown(): void {
  try {
    if (sessionStorage.getItem(REPORTED_KEY)) return;
    const raw = sessionStorage.getItem(ARRIVAL_KEY);
    if (!raw) return;
    const arrivedAt = Number(raw);
    if (!Number.isFinite(arrivedAt)) return;
    sessionStorage.setItem(REPORTED_KEY, '1');
    const ms = Date.now() - arrivedAt;
    if (ms < 0) return;
    reportReliabilityEvent('verdict_time_to_first', { ms });
  } catch {
    /* best-effort — a missed timing beacon is not worth surfacing to the user */
  }
}
