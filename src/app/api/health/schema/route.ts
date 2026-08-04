import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SCHEMA_CONTRACT, migrationFor } from '@/lib/schemaContract';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * DOES THIS DEPLOYMENT'S DATABASE HAVE WHAT THIS DEPLOYMENT'S CODE NEEDS?
 *
 * The question nothing in the pipeline was asking. Migration 0041 shipped as
 * code, was never applied, and production served cards that read four tables
 * which did not exist — for days, silently, because the honest "availability
 * not confirmed" fallback looks identical whether a title is unchecked or its
 * table is absent.
 *
 * Probes every object in SCHEMA_CONTRACT against the live database and names
 * the missing ones with the migration that would create them. Read-only: a
 * `select ... limit 1` per object and nothing else.
 *
 * Deliberately UNAUTHENTICATED, and deliberately safe to be:
 *   - it returns object NAMES, which are already public in this repository,
 *   - it returns no row data, no counts, no credentials, no environment
 *     values — only booleans about whether configuration exists,
 *   - and a deploy gate that requires a human to authenticate is a deploy
 *     gate that gets skipped.
 */
export async function GET() {
  const objects = [...new Set(SCHEMA_CONTRACT.map((r) => r.object))].sort();
  const missing: { object: string; migration: string; error: string }[] = [];
  const present: string[] = [];
  let probeFailed: string | null = null;

  try {
    const admin = createAdminClient();
    // Sequential on purpose: a burst of 73 concurrent PostgREST calls from a
    // health check is a self-inflicted load spike, and this runs rarely.
    for (const object of objects) {
      const { error } = await admin.from(object).select('*').limit(1);
      if (error) {
        missing.push({ object, migration: migrationFor(object) ?? 'unknown', error: error.message });
      } else {
        present.push(object);
      }
    }
  } catch (e) {
    probeFailed = e instanceof Error ? e.message : 'probe failed';
  }

  // Which migrations the missing objects belong to — the actionable summary.
  const migrations = [...new Set(missing.map((m) => m.migration))].sort();

  const ok = probeFailed === null && missing.length === 0;
  return NextResponse.json(
    {
      ok,
      checked: objects.length,
      presentCount: present.length,
      missingCount: missing.length,
      /** The migrations an operator needs to apply, in order. */
      unappliedMigrations: migrations,
      missing,
      probeFailed,
      /** Booleans only — never the values. Says whether a runner COULD run. */
      runner: {
        databaseUrlConfigured: Boolean(serverEnv.migrationsDbUrl()),
        adminAllowlistConfigured: serverEnv.adminEmails().length > 0,
        migrateSecretConfigured: Boolean(serverEnv.migrateSecret()),
      },
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
