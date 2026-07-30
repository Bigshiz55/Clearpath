import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { applyCuratedCaseFacts } from '@/lib/packs/cases';

export const dynamic = 'force-dynamic';

/**
 * Applies the fixed, embedded curated-case-facts dataset
 * (src/lib/packs/curatedCaseFacts.ts) — never arbitrary input, so this can't
 * be abused into writing attacker-supplied content. Each bundle only
 * attaches to a `cases` row that already exists (matched by title); nothing
 * is ever created. Safe to call repeatedly — already-written subjects/
 * timeline events are skipped.
 *
 * Authorized the same way as /api/admin/migrate: a bearer token matching
 * MIGRATE_SECRET, or a signed-in ADMIN_EMAILS user.
 */
export async function POST(request: Request) {
  let authorized = false;
  const secret = serverEnv.migrateSecret();
  const auth = request.headers.get('authorization') ?? '';
  if (secret && auth === `Bearer ${secret}`) authorized = true;
  if (!authorized) {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const admins = serverEnv.adminEmails();
      if (user?.email && admins.includes(user.email.toLowerCase())) authorized = true;
    } catch {
      /* not signed in */
    }
  }
  let body: { secret?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    /* no body */
  }
  if (!authorized && secret && body.secret === secret) authorized = true;
  if (!authorized) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  try {
    const admin = createAdminClient();
    const results = await applyCuratedCaseFacts(admin);
    const matched = results.filter((r) => r.matchedCaseId).length;
    return NextResponse.json({ ok: true, bundles: results.length, matched, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, { status: 500 });
  }
}
