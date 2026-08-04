/**
 * ONE BOUND FOR EVERY CLIENT FETCH.
 *
 * A `fetch()` call with no `AbortController` has no upper bound at all — a
 * stalled connection leaves it pending indefinitely, which is what an
 * async feature's `loading` state was keyed on. Several components
 * (ReleaseWall, TitleGridCalibration, the reliability sprint's item 8
 * sweep) had this same bug independently: a `try/catch` around the fetch
 * looked complete, but a hang never rejects, so the catch never runs and
 * the spinner never resolves either way.
 *
 * `fetchWithTimeout` rejects after `timeoutMs` exactly like a network
 * error would — no new failure mode for callers to special-case, just a
 * genuine upper bound on how long "loading" is allowed to mean something.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
