import 'server-only';

import { publicEnv } from '@/lib/env';

/**
 * WILL A MAGIC LINK REQUESTED FROM THIS ORIGIN ACTUALLY COME BACK TO IT?
 *
 * A real person asked for a sign-in link on a Vercel PREVIEW deployment and the
 * link dropped them on `http://localhost:3000`. Nothing in this app did that:
 * `LoginForm` builds `emailRedirectTo` from `window.location.origin`, and
 * `/auth/callback` redirects using the request's own origin. Both are correct.
 *
 * The rewrite happens inside Supabase. GoTrue validates `redirect_to` against
 * Site URL + Additional Redirect URLs and, when it does not match, SILENTLY
 * substitutes the project's Site URL instead of refusing. Vercel gives every
 * deployment a fresh hostname, so a preview is never on that allow-list unless
 * a wildcard covers it — and the user finds out only after the email arrives,
 * by landing on a dead localhost tab with no clue why.
 *
 * This asks the question BEFORE the email is sent. The same validation runs on
 * `/auth/v1/verify`, and it runs BEFORE the token is looked at, so a
 * deliberately invalid token is enough to see the answer:
 *
 *   Location echoes our own origin  → the link will come home.
 *   Location is somewhere else      → it will strand the user THERE.
 *
 * Nothing is created and no email is sent — the token is junk by construction.
 *
 * FAILS OPEN. If the probe cannot run (offline, timeout, no Location header),
 * the answer is "fine": a diagnostic must never be the reason someone cannot
 * sign in. Only a definite Location pointing somewhere other than us counts as
 * a failure, because that is not a guess — it is the exact URL the user would
 * have been sent to.
 */

export interface RedirectCheck {
  /** True when a magic link from this origin will return to this origin. */
  ok: boolean;
  /** Where Supabase would actually send the user. Only set when `ok` is false. */
  landsOn?: string;
}

const OK: RedirectCheck = { ok: true };

/** Junk on purpose: validation happens before the token is read. */
const PROBE_TOKEN = 'watchverdict-redirect-preflight-not-a-real-token';

const PROBE_TIMEOUT_MS = 3_000;

/**
 * Cache by origin. A pass is stable for the life of the process; a failure is
 * held only briefly, so the moment the allow-list is corrected the next login
 * page render picks it up without a redeploy.
 */
const FAILURE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: RedirectCheck }>();

function cached(origin: string, nowMs: number): RedirectCheck | null {
  const hit = cache.get(origin);
  if (!hit) return null;
  if (hit.result.ok) return hit.result;
  return nowMs - hit.at < FAILURE_TTL_MS ? hit.result : null;
}

/** Same-origin comparison, tolerant of a missing/odd Location value. */
function sameOrigin(location: string, origin: string): boolean {
  try {
    return new URL(location, origin).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export async function checkAuthRedirect(origin: string, nowMs = Date.now()): Promise<RedirectCheck> {
  if (!origin) return OK;

  const hit = cached(origin, nowMs);
  if (hit) return hit;

  let supabaseUrl: string;
  try {
    supabaseUrl = publicEnv.supabaseUrl();
  } catch {
    return OK; // Auth isn't configured at all; the form reports that itself.
  }

  const target = `${origin.replace(/\/+$/, '')}/auth/callback`;
  const probe =
    `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/verify` +
    `?token=${encodeURIComponent(PROBE_TOKEN)}&type=magiclink&redirect_to=${encodeURIComponent(target)}`;

  let result: RedirectCheck = OK;
  try {
    const res = await fetch(probe, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    // No Location at all means the probe told us nothing — not that it failed.
    if (location && !sameOrigin(location, origin)) {
      let landsOn = location;
      try {
        landsOn = new URL(location).origin;
      } catch {
        /* keep the raw value */
      }
      result = { ok: false, landsOn };
    }
  } catch {
    result = OK;
  }

  cache.set(origin, { at: nowMs, result });
  return result;
}

/** Test seam — the cache is process-wide and would otherwise leak between cases. */
export function resetRedirectCheckCache(): void {
  cache.clear();
}
