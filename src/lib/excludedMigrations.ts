/**
 * The explicit, audited list of `supabase/migrations/*.sql` files that are
 * intentionally ABSENT from `PENDING_MIGRATIONS` (pendingMigrations.ts) — and
 * why. `scripts/checkMigrationsRegistered.ts` fails the build for any .sql
 * file that is neither registered nor listed here, which is exactly the gap
 * that silently broke migrations 0036 through 0038: a file can exist on disk,
 * pass code review, and never actually run.
 *
 * Every entry here is a DELIBERATE decision, not an oversight — add one only
 * when a migration must never be applied automatically, and say why.
 */
/**
 * DEFECTIVE, NOT RETIRED — a separate category on purpose.
 *
 * The other entries below are excluded because they SHOULD never run: they
 * predate the runner, or their feature is gone. These are excluded because
 * they CANNOT run correctly as written, and are expected to come back once
 * corrected. Keeping the distinction explicit means "why is this excluded?"
 * has a real answer, and lets /api/version surface a withdrawn migration
 * instead of advertising it as the newest thing in the codebase.
 */
export const WITHDRAWN_MIGRATIONS: Record<string, string> = {
  // Every statement in 0042 ALTERs `public.watchmode_availability`, which does
  // not exist in the production database: 0041 creates it, and 0041 has never
  // run there. Running 0042 would fail on its first statement.
  //
  // It is excluded rather than "fixed" by pointing it at a different table,
  // because the correct target is an open design question — the production
  // schema has `title_availability` (migration 0031, zero rows, no code path
  // reads or writes it) with a DIFFERENT identifier space and monetization
  // vocabulary from the one 0042 assumes. Choosing between extending that
  // table, adding a per-provider claim table, or applying 0041 first needs
  // the evidence in docs/SCHEMA_DRIFT_0042.md, not a rename.
  //
  // Removing this entry re-arms the migration for every runner at once. Do not
  // do it until a corrected 0042 AND its corrected rollback have been proven
  // against a database that matches production.
  '0042_canonical_availability':
    'withdrawn pending correction — targets public.watchmode_availability, which does not exist in production; see docs/SCHEMA_DRIFT_0042.md',
};

export const EXCLUDED_MIGRATIONS: Record<string, string> = {
  // Pre-automation baseline. `npm run migrate` / PENDING_MIGRATIONS started at
  // 0014 — everything before it was applied by hand against production before
  // the automated migration runner existed, so registering it now would be
  // redundant at best and, since the runner replays each migration's SQL
  // verbatim, potentially wrong if any of these files have since been hand-
  // edited to reflect the schema as it now stands rather than as it was
  // originally applied.
  '0001_init': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0002_digest': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0003_crews': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0004_court': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0005_quick_add': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0006_services': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0007_social': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0008_push': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0009_feedback': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0010_content_dna': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0011_sponsors': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0012_score_samples': 'pre-automation baseline — applied by hand before npm run migrate existed',
  '0013_tv_reminders': 'pre-automation baseline — applied by hand before npm run migrate existed',
  // Deliberately dead: the feature it supported was retired before this file
  // ever ran anywhere. Its SQL is commented out in the file itself and it
  // must stay that way — see the file's own header for the full explanation.
  '0033_voice_dna': 'deliberately never applied — feature retired before this migration ran; see the file header',
  ...WITHDRAWN_MIGRATIONS,
};
