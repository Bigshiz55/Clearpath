import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * PRODUCTION MONITORING — the operational events named in the reliability
 * sprint's item 9: page-load failures, per-provider API failures, quiz-load
 * failures, availability-resolution failures, empty New Releases results,
 * Pack timeouts, sign-in email failures, import failures, JS errors, 404s,
 * and homepage→first-Verdict timing.
 *
 * Reuses `analytics_events` (migration 0020) rather than a new table — it
 * already has the right shape (name, jsonb props, nullable user_id, indexed
 * by name+created_at) and is already the codebase's one "lightweight
 * product analytics, no PII" convention (see recordAnalyticsEvent in
 * actions/passFeedback.ts, which this deliberately does not replace — that
 * one is for product-interaction events with a real signed-in user context;
 * this one is for OPERATIONAL events that must record even when there is no
 * session at all, e.g. a 404 from a visitor with no cookies yet).
 *
 * Writes through the ADMIN client (service role), not the per-request
 * client: `analytics_events`'s insert policy is `user_id = auth.uid() or
 * user_id is null`, which is fine for authenticated product events but an
 * operational failure must never fail to record just because there's no
 * session, an expired one, or the failure IS the auth layer itself.
 *
 * NEVER PASS FREE TEXT. Every event name has a fixed, bounded prop shape
 * below — no titles, no search queries, no email addresses, no error
 * messages verbatim. `sanitizeProps` enforces this at the boundary: an
 * unrecognized field, or a string value over the length cap, is dropped
 * rather than silently let through.
 */

export const RELIABILITY_EVENTS = [
  'page_load_failure',
  'api_failure',
  'quiz_load_failure',
  'availability_resolution_failure',
  'new_releases_empty',
  'pack_timeout',
  'signin_email_failure',
  'import_failure',
  'js_error',
  'not_found',
  'verdict_time_to_first',
] as const;

export type ReliabilityEventName = (typeof RELIABILITY_EVENTS)[number];

/** Only primitive, bounded values — never a free-text field. */
export type ReliabilityEventProps = Record<string, string | number | boolean | null>;

const MAX_STRING_LEN = 80;
const MAX_PROPS = 12;

/** Drops anything that isn't a short primitive — the one place "no PII" is enforced. */
function sanitizeProps(props: ReliabilityEventProps): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  let count = 0;
  for (const [key, value] of Object.entries(props)) {
    if (count >= MAX_PROPS) break;
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      count++;
      continue;
    }
    if (typeof value === 'string' && value.length <= MAX_STRING_LEN) {
      out[key] = value;
      count++;
    }
    // Longer strings (which is exactly the shape a raw error message, a
    // search query, or a title would take) are silently dropped, not
    // truncated — truncating would still leak the start of the content.
  }
  return out;
}

/**
 * Records one reliability event. Best-effort and NEVER throws — a
 * monitoring failure must never become a user-facing failure. Call sites
 * are fire-and-forget (`void recordReliabilityEvent(...)`).
 */
export async function recordReliabilityEvent(
  name: ReliabilityEventName,
  props: ReliabilityEventProps = {},
  userId: string | null = null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('analytics_events').insert({
      user_id: userId,
      name,
      props: sanitizeProps(props),
    });
  } catch {
    /* monitoring is best-effort — never blocks or breaks the caller */
  }
}

export interface ReliabilityCount {
  name: ReliabilityEventName | string;
  count: number;
}

export interface ReliabilitySummary {
  windowHours: number;
  total: number;
  byName: ReliabilityCount[];
  /** True when the row cap below was hit — counts are a floor, not exact. */
  truncated: boolean;
}

// A first-use dashboard, not a metrics warehouse: reading and counting rows
// in JS avoids a new SQL aggregate/migration, and this cap keeps a spike
// from ever turning the page into an unbounded query. If real traffic
// regularly hits this cap, that's itself worth knowing (see `truncated`).
const SUMMARY_ROW_CAP = 5000;

/** Counts of every reliability event in the last `hours`, admin-only (server-side; caller must gate access). */
export async function getReliabilitySummary(hours = 24): Promise<ReliabilitySummary> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('analytics_events')
    .select('name')
    .in('name', RELIABILITY_EVENTS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_ROW_CAP);

  const rows = (data ?? []) as Array<{ name: string }>;
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);

  const byName = RELIABILITY_EVENTS.map((name) => ({ name, count: counts.get(name) ?? 0 }));

  return {
    windowHours: hours,
    total: rows.length,
    byName: byName.sort((a, b) => b.count - a.count),
    truncated: rows.length >= SUMMARY_ROW_CAP,
  };
}
