import { NextResponse } from 'next/server';
import { getBuildInfo } from '@/lib/buildInfo';
import { getAppliedMigrationInfo } from '@/lib/appliedMigration';
import { WITHDRAWN_MIGRATIONS } from '@/lib/excludedMigrations';

export const dynamic = 'force-dynamic';

/**
 * Which commit is actually live — a one-request answer to "is this deployed
 * yet?" without opening the Vercel dashboard. Sourced from the same
 * build-time metadata as the footer stamp and BuildVersionBadge (never
 * hardcoded, never a secret). `Cache-Control: no-store` is set explicitly in
 * addition to the blanket `/api/:path*` no-store header in next.config.mjs,
 * so a deploy is never masked by a stale cached response.
 */
export async function GET() {
  const info = getBuildInfo();
  // READ-ONLY. Never triggers, repairs or applies a migration.
  const { appliedDatabaseMigration, migrationLedgerStatus } = await getAppliedMigrationInfo();
  return NextResponse.json(
    {
      sha: info.gitSha || null,
      shortSha: info.gitShaShort || 'dev',
      branch: info.gitBranch || 'dev',
      deployedAt: info.buildTimeIso || null,
      vercelEnv: info.vercelEnv || 'development',
      appVersion: info.appVersion,
      // THREE SEPARATE TRUTHS, never conflated again.
      //   latestMigrationInCode  - newest file in supabase/migrations/, known
      //                            at build time. Says nothing about the DB.
      //   appliedDatabaseMigration - read from the public.schema_migrations
      //                            ledger at request time, or 'unknown' when
      //                            it cannot be proven. Never falls back to
      //                            the code-side value.
      //   withdrawnMigrations    - files that exist but NO runner will apply,
      //                            because they are defective. Reported here
      //                            because latestMigrationInCode is a filename
      //                            scan: without this, a withdrawn migration
      //                            still reads as the newest thing in the
      //                            codebase, which is how 0042 would have
      //                            looked like the intended target state.
      latestMigrationInCode: info.schemaVersion || null,
      appliedDatabaseMigration,
      migrationLedgerStatus,
      withdrawnMigrations: Object.keys(WITHDRAWN_MIGRATIONS),
      // Retained temporarily so existing dashboards/scripts do not break, but
      // it is the CODE-side value and must not be read as the applied schema.
      schemaVersion: info.schemaVersion || null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
