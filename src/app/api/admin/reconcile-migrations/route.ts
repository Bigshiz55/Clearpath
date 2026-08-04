import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';
import { LEDGER_DDL, MIGRATION_LOCK_KEY } from '@/lib/migrationLedger';
import { PROBES, classify, shouldBackfill, type ReconcileResult } from '@/lib/migrationReconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ONE-TIME LEDGER RECONCILIATION — proves history from the schema itself.
 *
 * This endpoint NEVER applies a migration. It runs read-only probes against
 * information_schema, classifies each historical migration, and backfills the
 * ledger ONLY for those proven applied by a concrete database object.
 *
 * PROVEN_NOT_APPLIED and UNKNOWN are never backfilled. An unbackfilled row is
 * recoverable; a wrongly backfilled one silently licenses skipping a migration
 * that never ran, which is the more expensive mistake.
 *
 * `dryRun: true` (the default) classifies and reports without writing.
 */
export async function POST(request: Request) {
  let authorized = false;
  const secret = serverEnv.migrateSecret();
  const auth = request.headers.get('authorization') ?? '';
  if (secret && auth === `Bearer ${secret}`) authorized = true;

  let body: { dbUrl?: string; secret?: string; host?: string; port?: string; database?: string; user?: string; password?: string; dryRun?: boolean } = {};
  try { body = (await request.json()) as typeof body; } catch { /* no body */ }

  if (!authorized) {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email && serverEnv.adminEmails().includes(user.email.toLowerCase())) authorized = true;
    } catch { /* not signed in */ }
  }
  if (!authorized && secret && body.secret === secret) authorized = true;
  if (!authorized) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

  // Default to a dry run: reconciliation must be inspectable before it writes.
  const dryRun = body.dryRun !== false;

  let clientConfig: { host: string; port: number; user: string; password: string; database: string } | { connectionString: string };
  if (typeof body.host === 'string' && body.host.trim() && typeof body.password === 'string' && body.password) {
    const port = Number(body.port);
    clientConfig = {
      host: body.host.trim(),
      port: Number.isFinite(port) && port > 0 ? port : 5432,
      user: (body.user ?? 'postgres').trim() || 'postgres',
      password: body.password,
      database: (body.database ?? 'postgres').trim() || 'postgres',
    };
  } else {
    const raw = typeof body.dbUrl === 'string' && body.dbUrl.trim() ? body.dbUrl : serverEnv.migrationsDbUrl();
    if (!raw) return NextResponse.json({ error: 'No database connection info.' }, { status: 503 });
    const dbUrl = sanitizeDbUrl(raw);
    const v = validateDbUrl(dbUrl);
    if (!v.ok) return NextResponse.json({ stage: 'validate', error: v.reason }, { status: 400 });
    clientConfig = { connectionString: dbUrl };
  }

  let client: Client;
  try {
    client = new Client({ ...clientConfig, ssl: { rejectUnauthorized: false } });
    await client.connect();
  } catch (e) {
    return NextResponse.json({ stage: 'connect', error: e instanceof Error ? e.message : 'connect failed' }, { status: 502 });
  }

  const results: ReconcileResult[] = [];
  let lockHeld = false;
  try {
    await client.query(LEDGER_DDL);
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockHeld = true;

    for (const probe of PROBES) {
      let present: boolean | null = null;
      try {
        const { rows } = await client.query<{ exists: boolean }>(probe.sql);
        present = Boolean(rows[0]?.exists);
      } catch {
        present = null; // could not probe -> UNKNOWN, never a guess
      }
      const classification = classify(present, probe.evidence);
      let backfilled = false;

      if (!dryRun && shouldBackfill(classification)) {
        try {
          // reconciled=true, checksum NULL: we can prove it RAN, but not which
          // SQL text produced it. decideForMigration() treats a null checksum
          // as "do not rerun, do not claim a match" — deliberately.
          await client.query(
            `insert into public.schema_migrations
               (name, filename, checksum, completed_at, success, execution_method, environment, reconciled, evidence)
             values ($1,$2,null,now(),true,'reconciliation',$3,true,$4)
             on conflict (name) do update set
               success=true, reconciled=true, evidence=excluded.evidence`,
            [probe.migration, `${probe.migration}.sql`, process.env.VERCEL_ENV ?? 'unknown', probe.evidence],
          );
          backfilled = true;
        } catch { /* leave unbackfilled rather than record something unproven */ }
      }

      results.push({
        migration: probe.migration,
        classification,
        evidence: present === null ? null : probe.evidence,
        backfilled,
      });
    }
  } finally {
    if (lockHeld) await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    await client.end().catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    note: dryRun
      ? 'Dry run — nothing was written. Send {"dryRun": false} to backfill PROVEN_APPLIED rows only.'
      : 'PROVEN_APPLIED rows backfilled. PROVEN_NOT_APPLIED and UNKNOWN were left untouched.',
    results,
  });
}
