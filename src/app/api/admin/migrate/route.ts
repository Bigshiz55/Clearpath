import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { PENDING_MIGRATIONS } from '@/lib/pendingMigrations';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Admin-gated migration runner. Applies a FIXED, embedded set of idempotent
 * migrations (never arbitrary SQL, so it can't be abused) to the Postgres
 * connection in `SUPABASE_DB_URL`. Each migration runs in its own transaction,
 * so one failure (e.g. a missing prerequisite) doesn't block the others.
 *
 * Authorized by EITHER a signed-in admin (ADMIN_EMAILS) OR a bearer token
 * matching `MIGRATE_SECRET`. Dormant (503) until the DB URL is configured.
 */
export async function POST(request: Request) {
  // ── Authorize ────────────────────────────────────────────────────────────
  let authorized = false;
  const secret = serverEnv.migrateSecret();
  const auth = request.headers.get('authorization') ?? '';
  if (secret && auth === `Bearer ${secret}`) authorized = true;
  if (!authorized) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const admins = serverEnv.adminEmails();
      if (user?.email && admins.includes(user.email.toLowerCase())) authorized = true;
    } catch {
      /* not signed in */
    }
  }
  // A secret passed in the JSON body also authorizes (so the /migrate page can
  // send it without a custom header).
  let body: { dbUrl?: string; secret?: string } = {};
  try { body = (await request.json()) as typeof body; } catch { /* no body */ }
  if (!authorized && secret && body.secret === secret) authorized = true;
  if (!authorized) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  // Connection string from the request (one-time, gated by the secret) or env.
  const dbUrl = (typeof body.dbUrl === 'string' && body.dbUrl.startsWith('postgres') ? body.dbUrl : null) ?? serverEnv.migrationsDbUrl();
  if (!dbUrl) {
    return NextResponse.json(
      { error: 'No database URL. Paste your Supabase connection string (Settings → Database → Connection string, "URI"), or set SUPABASE_DB_URL in your env.' },
      { status: 503 },
    );
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const results: { name: string; ok: boolean; error?: string }[] = [];
  try {
    await client.connect();
  } catch (e) {
    return NextResponse.json({ error: `Could not connect to the database: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 });
  }

  try {
    for (const m of PENDING_MIGRATIONS) {
      const sql = Buffer.from(m.sqlB64, 'base64').toString('utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('commit');
        results.push({ name: m.name, ok: true });
      } catch (e) {
        try { await client.query('rollback'); } catch { /* ignore */ }
        results.push({ name: m.name, ok: false, error: e instanceof Error ? e.message : 'failed' });
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  const applied = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, applied, total: results.length, results });
}
