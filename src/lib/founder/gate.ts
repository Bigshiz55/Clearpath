import 'server-only';
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';
import { isAdminEmail } from '@/lib/admin';

/**
 * TEMPORARY FOUNDER ACCESS ADAPTER.
 *
 * Public sign-in is disabled, so the email allowlist alone cannot let the
 * founder in. This grants access from a private code held ONLY in
 * `FOUNDER_ACCESS_CODE` on the server.
 *
 * It is an ADAPTER on purpose. Everything protected calls `hasFounderAccess()`
 * and nothing else. When normal sign-in returns, delete the code branch and the
 * lab keeps working unchanged — no protected route knows how access was proved.
 *
 * Design notes that matter:
 *
 *   * The signing key is DERIVED from the access code, so rotating the code
 *     invalidates every outstanding session. That is the intended revocation
 *     path, and it means there is exactly one secret to manage.
 *   * The cookie carries no secret — only a timestamped, signed assertion. The
 *     code itself never leaves the server, never reaches the bundle, and is
 *     never logged.
 *   * Comparison is over fixed-length digests, so neither the code's value nor
 *     its LENGTH leaks through timing.
 */

export const FOUNDER_COOKIE = 'wv_founder';
/** Four hours, per the brief. Short enough that a leaked cookie ages out. */
export const SESSION_TTL_SECONDS = 4 * 60 * 60;
const TOKEN_VERSION = 'v1';

/** Derive the HMAC key from the access code. Never the code itself. */
function signingKey(code: string): Buffer {
  return createHash('sha256').update(`wv-founder-session:${code}`).digest();
}

/**
 * Constant-time equality over SHA-256 digests. Hashing first means the
 * comparison is always over 32 bytes, so a wrong-length guess costs exactly as
 * much as a right-length one.
 */
export function secretEquals(a: string, b: string): boolean {
  const da = createHash('sha256').update(a).digest();
  const db = createHash('sha256').update(b).digest();
  return timingSafeEqual(da, db);
}

const b64url = (b: Buffer) => b.toString('base64url');

export interface FounderSessionPayload {
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Random per-session id — a fresh one every login defeats fixation. */
  jti: string;
}

/** Mint a signed session token. Called only after the code has been verified. */
export function mintToken(code: string, now = Math.floor(Date.now() / 1000)): string {
  const payload: FounderSessionPayload = {
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: randomBytes(16).toString('hex'),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', signingKey(code)).update(`${TOKEN_VERSION}.${body}`).digest());
  return `${TOKEN_VERSION}.${body}.${sig}`;
}

/**
 * Verify a token. Returns the payload or null — never throws, and never
 * distinguishes "tampered" from "expired" to the caller in a way that reaches
 * the user, because both mean the same thing: no access.
 */
export function verifyToken(token: string | undefined, code: string, now = Math.floor(Date.now() / 1000)): FounderSessionPayload | null {
  if (!token || !code) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, body, sig] = parts as [string, string, string];
  if (version !== TOKEN_VERSION) return null;

  const expected = b64url(createHmac('sha256', signingKey(code)).update(`${version}.${body}`).digest());
  // Compare through the digest helper so a forged signature of a different
  // length cannot be distinguished by timing either.
  if (!secretEquals(sig, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as FounderSessionPayload;
    if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number' || typeof payload.jti !== 'string') return null;
    if (payload.exp <= now) return null;
    // A token issued in the future is a clock-skew or forgery signal; refuse it.
    if (payload.iat > now + 300) return null;
    return payload;
  } catch {
    return null;
  }
}

export type AccessMethod = 'founder_code' | 'admin_email' | 'none';

export interface FounderAccess {
  allowed: boolean;
  method: AccessMethod;
  expiresAt: number | null;
}

/**
 * THE ONLY GATE. Every founder page and every founder API calls this, server
 * side, on every request. Two accepted proofs today; either is sufficient, and
 * a protected route never learns which was used.
 */
export async function resolveFounderAccess(): Promise<FounderAccess> {
  // 1) Temporary code session.
  const code = serverEnv.founderAccessCode();
  if (code) {
    const token = cookies().get(FOUNDER_COOKIE)?.value;
    const payload = verifyToken(token, code);
    if (payload) return { allowed: true, method: 'founder_code', expiresAt: payload.exp };
  }

  // 2) Normal admin session — the path this adapter will collapse back into
  //    once public sign-in is restored.
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const { data: { user } } = await createClient().auth.getUser();
    if (user?.email && isAdminEmail(user.email)) {
      return { allowed: true, method: 'admin_email', expiresAt: null };
    }
  } catch {
    // Auth unavailable is simply "not signed in".
  }

  return { allowed: false, method: 'none', expiresAt: null };
}

/** Convenience for route handlers and pages. */
export async function hasFounderAccess(): Promise<boolean> {
  return (await resolveFounderAccess()).allowed;
}

/** Cookie options. `secure` is off only on plain-HTTP localhost. */
export function cookieOptions(isProduction = process.env.NODE_ENV === 'production') {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
