import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { publicEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PREVIEW-ONLY TEST LOGIN — the smallest thing that lets CI be a real user.
 *
 * The black-box gate must exercise the product's ACTUAL authentication, and
 * this app carries a session in cookies (`src/lib/arch/authTransport.test.ts`
 * pins that). A bearer token is never consumed, so CI cannot fake its way in
 * with one — and teaching the whole application to accept bearer auth to suit a
 * test harness would create a second production front door, which is a far
 * larger change than the harness needs and a permanent one.
 *
 * So the harness signs in properly. This route performs a real Supabase
 * password grant for one synthetic identity and writes the same SSR cookies any
 * ordinary sign-in writes. Nothing downstream knows or cares that CI is the
 * caller: RLS applies exactly as it does to a person, because it IS an ordinary
 * user session.
 *
 * INERT IN PRODUCTION, BY THE ENVIRONMENT AND NOT BY A FLAG. `VERCEL_ENV` is
 * set by the platform, not by the request and not by our own configuration, so
 * production cannot be talked into enabling this. It answers 404 there — not
 * 403 — so a prod caller cannot even learn the route exists.
 *
 * THE CREDENTIALS NEVER LEAVE THE SERVER. The test user's email and password
 * live in Preview environment variables; CI holds only a shared secret that
 * authorises the call. That is deliberate: a leaked CI secret buys a session as
 * a synthetic user on a preview, while leaked credentials would be reusable
 * anywhere Supabase is reachable.
 *
 * TEMPORARY, and scoped to the black-box gate. Delete it with the gate.
 */

/** Compared over digests so neither the secret's value nor its length leaks. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // The platform decides this, not us and not the caller.
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const expected = process.env.PREVIEW_TEST_LOGIN_SECRET ?? '';
  const email = process.env.PREVIEW_TEST_EMAIL ?? '';
  const password = process.env.PREVIEW_TEST_PASSWORD ?? '';
  // An unconfigured deployment authorises nobody. Without this an empty secret
  // would match an empty header and the route would be open.
  if (!expected || !email || !password) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const provided = req.headers.get('x-preview-test-secret') ?? '';
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const cookieStore = cookies();
  const written: string[] = [];
  const supabase = createServerClient(publicEnv.supabaseUrl(), publicEnv.supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: { name: string; value: string; options?: CookieOptions }[]) {
        for (const { name, value, options } of toSet) {
          cookieStore.set(name, value, options);
          written.push(name); // NAMES only — a value here would be the session.
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // The reason is useful and carries no credential; the password never
    // appears in it and the email is already known to whoever configured this.
    return NextResponse.json({ error: 'Test sign-in failed.' }, { status: 401 });
  }

  return NextResponse.json(
    { ok: true, cookiesSet: written.length, env: process.env.VERCEL_ENV ?? 'development' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
