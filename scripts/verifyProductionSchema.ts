/**
 * BUILD GATE 2 OF 2 — the one that would have caught migration 0041.
 *
 * Asks a LIVE deployment whether its database has every object its code
 * needs, and exits non-zero when it does not. Run it against the production
 * URL after a deploy:
 *
 *   npx tsx scripts/verifyProductionSchema.ts https://example.vercel.app
 *
 * It needs no credentials — /api/health/schema returns object names and
 * booleans, never data or configuration values — which is the point: a check
 * that requires a secret is a check that does not run in CI.
 */
const url = process.argv[2] ?? process.env.PRODUCTION_URL;

interface Health {
  ok: boolean;
  checked: number;
  missingCount: number;
  unappliedMigrations: string[];
  missing: { object: string; migration: string; error: string }[];
  probeFailed: string | null;
  runner: { databaseUrlConfigured: boolean; adminAllowlistConfigured: boolean; migrateSecretConfigured: boolean };
}

async function main(): Promise<void> {
  if (!url) {
    console.error('[verify-schema] Usage: verifyProductionSchema.ts <deployment-url>');
    process.exit(2);
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/api/health/schema`);
  const body = (await res.json()) as Health;

  if (body.probeFailed) {
    console.error(`[verify-schema] FAILED — could not probe the database: ${body.probeFailed}`);
    process.exit(1);
  }

  if (body.ok) {
    console.log(`[verify-schema] OK — all ${body.checked} required objects exist in ${url}.`);
    return;
  }

  console.error(`[verify-schema] FAILED — ${body.missingCount} of ${body.checked} required objects are MISSING.`);
  console.error('');
  console.error('The deployed code reads or writes these, and the database does not have them:');
  for (const m of body.missing) console.error(`  - ${m.object}  (created by ${m.migration})`);
  console.error('');
  console.error(`Apply, in order: ${body.unappliedMigrations.join(', ')}`);
  console.error('');
  console.error('Runner configuration on that deployment:');
  console.error(`  database URL configured : ${body.runner.databaseUrlConfigured}`);
  console.error(`  admin allowlist set     : ${body.runner.adminAllowlistConfigured}`);
  console.error(`  migrate secret set      : ${body.runner.migrateSecretConfigured}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`[verify-schema] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

// Module scope: without an import or export a script file is global, and its
// `main` collides with every other script in the type-check.
export {};
