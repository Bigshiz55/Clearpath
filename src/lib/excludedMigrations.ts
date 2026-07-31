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
};
