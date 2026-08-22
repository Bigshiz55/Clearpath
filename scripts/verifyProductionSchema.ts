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
 *
 * TWO INDEPENDENT CHECKS, deliberately, because each catches what the other
 * cannot:
 *   1. SCHEMA OBJECTS (/api/health/schema): every contract object exists.
 *      Catches a migration that claimed to run but left nothing behind.
 *   2. MIGRATION IDENTITY (/api/version): the newest migration the DEPLOYED
 *      code knows is also the newest one some ledger records as applied.
 *      Catches the contract-invisible class — a migration whose objects are
 *      not in the contract (an index, a policy change, a data fix) that was
 *      merged but never applied: the exact 0041 failure shape, one layer up.
 *      Both names come from the same deployment's own response, so a deploy
 *      still in flight cannot produce a false failure.
 * "The migrate command exited 0" is evidence of neither.
 */

export interface HealthBody {
  ok: boolean;
  checked: number;
  missingCount: number;
  unappliedMigrations: string[];
  missing: { object: string; migration: string; error: string }[];
  probeFailed: string | null;
  runner: { databaseUrlConfigured: boolean; adminAllowlistConfigured: boolean; migrateSecretConfigured: boolean };
}

export interface VersionBody {
  latestMigrationInCode: string | null;
  appliedMigrationName: string | null;
  migrationLedgerStatus?: string;
}

export interface VerifyOutcome {
  ok: boolean;
  messages: string[];
}

/** The 4-digit sequence prefix, or null when the name doesn't carry one. */
function seq(name: string | null | undefined): number | null {
  const m = /^(\d{4})_/.exec(name ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * The whole verification, pure of process concerns so tests can run it
 * in-process with a stubbed fetch and CI still gets the real thing.
 */
export async function verifySchema(
  baseUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<VerifyOutcome> {
  const base = baseUrl.replace(/\/$/, '');
  const messages: string[] = [];

  // ── Check 1: every schema object the deployed code needs exists ─────────
  const res = await fetchFn(`${base}/api/health/schema`);
  const body = (await res.json()) as HealthBody;

  if (body.probeFailed) {
    return { ok: false, messages: [`FAILED — could not probe the database: ${body.probeFailed}`] };
  }

  if (!body.ok) {
    messages.push(`FAILED — ${body.missingCount} of ${body.checked} required objects are MISSING.`);
    messages.push('The deployed code reads or writes these, and the database does not have them:');
    for (const m of body.missing) messages.push(`  - ${m.object}  (created by ${m.migration})`);
    messages.push(`Apply, in order: ${body.unappliedMigrations.join(', ')}`);
    messages.push('Runner configuration on that deployment:');
    messages.push(`  database URL configured : ${body.runner.databaseUrlConfigured}`);
    messages.push(`  admin allowlist set     : ${body.runner.adminAllowlistConfigured}`);
    messages.push(`  migrate secret set      : ${body.runner.migrateSecretConfigured}`);
    return { ok: false, messages };
  }
  messages.push(`OK — all ${body.checked} required objects exist.`);

  // ── Check 2: the recorded migration identity has kept up with the code ──
  let version: VersionBody;
  try {
    const vres = await fetchFn(`${base}/api/version`);
    if (!vres.ok) throw new Error(`HTTP ${vres.status}`);
    version = (await vres.json()) as VersionBody;
  } catch (e) {
    return {
      ok: false,
      messages: [...messages, `FAILED — /api/version unreachable, migration identity cannot be verified: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const { latestMigrationInCode, appliedMigrationName, migrationLedgerStatus } = version;
  if (!appliedMigrationName) {
    return {
      ok: false,
      messages: [
        ...messages,
        `FAILED — the deployment cannot name any applied migration (ledger status: ${migrationLedgerStatus ?? 'unknown'}). `
          + 'Schema objects existing is not enough: an unreadable or empty ledger means the next run cannot decide safely.',
      ],
    };
  }

  const codeSeq = seq(latestMigrationInCode);
  const appliedSeq = seq(appliedMigrationName);
  if (codeSeq !== null && appliedSeq !== null && appliedSeq < codeSeq) {
    return {
      ok: false,
      messages: [
        ...messages,
        `FAILED — deployed code is AHEAD of the recorded migrations: newest in code is ${latestMigrationInCode}, `
          + `newest applied is ${appliedMigrationName}. Apply ${latestMigrationInCode} (its objects may simply not be `
          + 'in the schema contract, which is why check 1 passed).',
      ],
    };
  }

  messages.push(`OK — migration identity: ${appliedMigrationName} applied (${migrationLedgerStatus ?? 'ledger'}), newest in code ${latestMigrationInCode ?? 'unknown'}.`);
  return { ok: true, messages };
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? process.env.PRODUCTION_URL;
  if (!url) {
    console.error('[verify-schema] Usage: verifyProductionSchema.ts <deployment-url>');
    process.exit(2);
  }
  const outcome = await verifySchema(url);
  for (const line of outcome.messages) {
    (outcome.ok ? console.log : console.error)(`[verify-schema] ${line}`);
  }
  if (!outcome.ok) process.exit(1);
}

// Run only as a script — importing { verifySchema } from a test must not
// trigger a live fetch or a process.exit.
if (process.argv[1]?.includes('verifyProductionSchema')) {
  main().catch((e) => {
    console.error(`[verify-schema] FAILED: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
