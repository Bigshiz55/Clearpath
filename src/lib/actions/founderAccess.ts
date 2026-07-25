'use server';

import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import {
  FOUNDER_COOKIE, cookieOptions, mintToken, secretEquals, resolveFounderAccess,
} from '@/lib/founder/gate';
import { checkAttempts, recordFailure, clearAttempts, MIN_ATTEMPT_MS } from '@/lib/founder/attempts';

/**
 * Founder access server actions.
 *
 * The submitted code is read from a POSTed form field — never a query string,
 * never a URL — so it cannot land in an access log, a Referer header, or
 * browser history. It is never logged, never echoed, and never returned.
 */

export interface AccessState {
  error: string | null;
  lockedForSeconds?: number;
  remaining?: number | null;
}

/** Identify a client without storing an IP. Hashed, and only in memory. */
function clientKey(): string {
  const h = headers();
  const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || 'unknown';
  return createHash('sha256').update(`founder-attempt:${raw}`).digest('hex').slice(0, 32);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Verify the code and, on success, mint a session.
 *
 * Every path — wrong code, right code, lockout — pays at least
 * `MIN_ATTEMPT_MS`. That bounds how fast an instance will answer at all, and it
 * also means the success path is not observably faster than the failure path.
 */
export async function submitFounderCode(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const startedAt = Date.now();
  const settle = async (state: AccessState): Promise<AccessState> => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_ATTEMPT_MS) await sleep(MIN_ATTEMPT_MS - elapsed);
    return state;
  };

  const expected = serverEnv.founderAccessCode();
  if (!expected) {
    // Not configured: behave as a dead end, and say nothing about why.
    return settle({ error: 'Access is not available.' });
  }

  const key = clientKey();
  const gate = checkAttempts(key);
  if (!gate.allowed) {
    return settle({
      error: `Too many attempts. Try again in ${Math.ceil(gate.retryAfterSeconds / 60)} minute(s).`,
      lockedForSeconds: gate.retryAfterSeconds,
    });
  }

  const submitted = String(formData.get('code') ?? '');
  if (!submitted) return settle({ error: 'Enter your access code.', remaining: gate.remaining });

  if (!secretEquals(submitted, expected)) {
    const after = recordFailure(key);
    return settle(
      after.allowed
        ? { error: 'That code was not recognised.', remaining: after.remaining }
        : {
            error: `Too many attempts. Try again in ${Math.ceil(after.retryAfterSeconds / 60)} minute(s).`,
            lockedForSeconds: after.retryAfterSeconds,
          },
    );
  }

  // Success. A brand-new jti is minted here and only here, so a pre-existing
  // cookie value can never be promoted into an authenticated one (fixation).
  clearAttempts(key);
  cookies().set(FOUNDER_COOKIE, mintToken(expected), cookieOptions());
  await settle({ error: null });

  // Fixed destination. There is no redirect parameter to poison.
  redirect('/founder/recommendation-lab');
}

/** Drop the session immediately. Safe to call when already signed out. */
export async function founderLogout(): Promise<void> {
  cookies().set(FOUNDER_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  redirect('/founder/access');
}

/** Whether the caller currently holds founder access. Server-evaluated. */
export async function founderAccessStatus(): Promise<{ allowed: boolean; method: string; expiresAt: number | null }> {
  const a = await resolveFounderAccess();
  return { allowed: a.allowed, method: a.method, expiresAt: a.expiresAt };
}
