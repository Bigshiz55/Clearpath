import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { secretEquals } from '@/lib/founder/gate';
import {
  PREVIEW_TEST_EMAIL,
  PREVIEW_TEST_SECRET,
  isPreviewTestAuthActive,
} from '@/lib/previewTestAuth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — PREVIEW-ONLY LIVE-VERIFICATION LOGIN. DELETE AFTER THE VOICE
 * DNA LIVE MATRIX IS COMPLETE. See src/lib/previewTestAuth.ts for the threat
 * model and why this exists at all.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POST   — create-or-reset the synthetic live-test user (service role), then
 *          sign it in with a single-use random password so the response
 *          carries real Supabase auth cookies. The password is minted fresh
 *          per call and never returned.
 * DELETE — dispose of the synthetic user entirely (cascades its RLS-scoped
 *          rows: preference_events, voice_interviews, …). Used by cleanup.
 *
 * Every deny path — inactive environment, bad secret — is the same hidden
 * 404 the founder surfaces use, so the route's existence is not disclosed.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'cache-control': 'no-store' } as const;

function denied(): NextResponse {
  return new NextResponse('Not Found', { status: 404, headers: NO_STORE });
}

function authorized(req: NextRequest): boolean {
  if (!isPreviewTestAuthActive()) return false;
  const presented = req.headers.get('x-preview-test-secret') ?? '';
  return presented.length > 0 && secretEquals(presented, PREVIEW_TEST_SECRET);
}

/** Locate the synthetic user's id by email, or null. Pages the admin list. */
async function findTestUserId(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === PREVIEW_TEST_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return denied();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // Service-role key not configured in this environment — report honestly
    // (the caller already proved knowledge of the secret).
    return NextResponse.json(
      { ok: false, error: 'service_role_unavailable' },
      { status: 500, headers: NO_STORE },
    );
  }

  const password = randomBytes(24).toString('base64url');

  // Create the synthetic user, or reset its password if it already exists.
  const created = await admin.auth.admin.createUser({
    email: PREVIEW_TEST_EMAIL,
    password,
    email_confirm: true,
  });
  let userId = created.data.user?.id ?? null;
  if (!userId) {
    userId = await findTestUserId(admin);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'test_user_unavailable' },
        { status: 500, headers: NO_STORE },
      );
    }
    const reset = await admin.auth.admin.updateUserById(userId, { password });
    if (reset.error) {
      return NextResponse.json(
        { ok: false, error: 'password_reset_failed' },
        { status: 500, headers: NO_STORE },
      );
    }
  }

  // Real sign-in through the SSR client so the auth cookies land on the
  // response — from here on the browser session is indistinguishable from a
  // normal signed-in user.
  const supabase = createClient();
  const signIn = await supabase.auth.signInWithPassword({
    email: PREVIEW_TEST_EMAIL,
    password,
  });
  if (signIn.error) {
    return NextResponse.json(
      { ok: false, error: 'sign_in_failed' },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { ok: true, email: PREVIEW_TEST_EMAIL, userId },
    { status: 200, headers: NO_STORE },
  );
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return denied();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'service_role_unavailable' },
      { status: 500, headers: NO_STORE },
    );
  }

  const userId = await findTestUserId(admin);
  if (!userId) {
    // Nothing to dispose — already clean.
    return NextResponse.json({ ok: true, disposed: false }, { status: 200, headers: NO_STORE });
  }
  const del = await admin.auth.admin.deleteUser(userId);
  if (del.error) {
    return NextResponse.json(
      { ok: false, error: 'delete_failed' },
      { status: 500, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, disposed: true }, { status: 200, headers: NO_STORE });
}
