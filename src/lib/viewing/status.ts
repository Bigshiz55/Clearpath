/**
 * SOURCE STATUS — the difference between "nothing matched" and "we couldn't ask".
 *
 * The On TV page shipped one card for an unknown length of time because the
 * Gracenote grid started answering with an AWS WAF challenge and the call site
 * was `.catch(() => [])`. An upstream failure became an empty array, an empty
 * array became "no listings", and "no listings" rendered as a schedule. Nothing
 * in the response, the logs or the UI could tell those apart.
 *
 * Every source in this architecture must return one of these instead of a bare
 * array. `unavailable` and `healthy`-with-zero-rows are DIFFERENT answers and
 * the UI is required to say so.
 */

export type SourceStatus =
  | 'healthy'            // asked, answered, data returned
  | 'partial'            // some sub-requests succeeded, some failed
  | 'stale_cache'        // live call failed; serving cached data, honestly labelled
  | 'rate_limited'       // upstream told us to slow down
  | 'unauthorized'       // credentials rejected
  | 'misconfigured'      // no credentials supplied at all
  | 'provider_blocked'   // bot-challenge / WAF / geo block
  | 'malformed_response' // answered, but not in a shape we can parse
  | 'timeout'            // no answer inside the budget
  | 'unavailable';       // asked, answered, genuinely nothing there

/** Statuses that mean "the data is not trustworthy right now". */
const DEGRADED: ReadonlySet<SourceStatus> = new Set<SourceStatus>([
  'rate_limited', 'unauthorized', 'misconfigured',
  'provider_blocked', 'malformed_response', 'timeout',
]);

/** True when an empty result reflects a FAILURE, not an honest absence. */
export function isFailure(s: SourceStatus): boolean {
  return DEGRADED.has(s);
}

/** True when results may be shown but must carry a caveat. */
export function isDegraded(s: SourceStatus): boolean {
  return s !== 'healthy';
}

/**
 * What to tell the user. Deliberately distinguishes the two states the old code
 * conflated — the wording here is the product's honesty contract.
 */
export function statusMessage(s: SourceStatus, totalAvailable: number): string | null {
  switch (s) {
    case 'healthy':
      return totalAvailable === 0
        ? 'No matching titles were available from the connected data sources.'
        : null;
    case 'unavailable':
      return 'No matching titles were available from the connected data sources.';
    case 'partial':
      return 'Some sources could not be reached, so this list may be incomplete.';
    case 'stale_cache':
      return 'Showing recently cached listings — the live source could not be reached just now.';
    case 'rate_limited':
      return 'Listings are temporarily unavailable because the schedule source is rate-limiting requests.';
    case 'unauthorized':
      return 'Listings are unavailable because the schedule source rejected our credentials.';
    case 'misconfigured':
      return 'Listings are unavailable because no schedule provider is configured for this deployment.';
    case 'provider_blocked':
      return 'Listings are temporarily unavailable because the schedule source could not be reached.';
    case 'malformed_response':
      return 'Listings are temporarily unavailable because the schedule source returned unreadable data.';
    case 'timeout':
      return 'Listings are temporarily unavailable because the schedule source did not respond in time.';
  }
}

/** Merge many source statuses into the one the response should report. */
export function combineStatus(parts: SourceStatus[]): SourceStatus {
  if (parts.length === 0) return 'misconfigured';
  const anyHealthy = parts.some((p) => p === 'healthy');
  const anyFailed = parts.some((p) => isFailure(p));
  if (anyHealthy && anyFailed) return 'partial';
  if (anyHealthy) return parts.some((p) => p === 'stale_cache') ? 'partial' : 'healthy';
  // Nothing healthy. Report the most actionable failure rather than the first.
  const PRIORITY: SourceStatus[] = [
    'misconfigured', 'unauthorized', 'provider_blocked', 'rate_limited',
    'timeout', 'malformed_response', 'stale_cache', 'unavailable',
  ];
  for (const p of PRIORITY) if (parts.includes(p)) return p;
  return 'unavailable';
}

/** Map an HTTP response to a status. Centralised so every adapter agrees. */
export function statusFromHttp(code: number, body?: string): SourceStatus {
  if (code === 401 || code === 403) {
    // A WAF challenge is a 403/405 carrying an HTML interstitial, not JSON.
    if (body && /human verification|captcha|awswaf|are you a robot/i.test(body)) {
      return 'provider_blocked';
    }
    return code === 401 ? 'unauthorized' : 'provider_blocked';
  }
  if (code === 405 && body && /human verification|captcha|awswaf/i.test(body)) {
    return 'provider_blocked';
  }
  if (code === 429) return 'rate_limited';
  if (code >= 500) return 'unavailable';
  if (code >= 400) return 'malformed_response';
  return 'healthy';
}
