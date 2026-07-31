/**
 * Fails the build if any `supabase/migrations/*.sql` file is neither
 * registered in PENDING_MIGRATIONS nor explicitly excluded in
 * `src/lib/excludedMigrations.ts`. Runs before `npm run migrate` (and before
 * any database connection is attempted) so a registration gap is caught as a
 * static, offline check — this is exactly the gap that silently broke
 * migrations 0036 through 0038: the file existed, it just never ran.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_MIGRATIONS } from '../src/lib/pendingMigrations';
import { EXCLUDED_MIGRATIONS } from '../src/lib/excludedMigrations';

function main(): void {
  const dir = join(__dirname, '..', 'supabase', 'migrations');
  const onDisk = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''));

  const registered = new Set(PENDING_MIGRATIONS.map((m) => m.name));
  const excluded = new Set(Object.keys(EXCLUDED_MIGRATIONS));

  const unaccounted = onDisk.filter((name) => !registered.has(name) && !excluded.has(name));

  if (unaccounted.length > 0) {
    console.error('[check-migrations] FAILED — the following migration file(s) exist on disk but are neither');
    console.error('registered in src/lib/pendingMigrations.ts nor excluded in src/lib/excludedMigrations.ts,');
    console.error('so they would never actually run:');
    for (const name of unaccounted) console.error(`  - supabase/migrations/${name}.sql`);
    console.error('');
    console.error('Fix: register it in pendingMigrations.ts (regenerate the base64 entry) if it should');
    console.error('apply, or add it to EXCLUDED_MIGRATIONS in src/lib/excludedMigrations.ts with a reason');
    console.error('if it deliberately must not.');
    process.exit(1);
  }

  console.log(`[check-migrations] OK — ${onDisk.length} migration file(s) on disk, all accounted for (${registered.size} registered, ${excluded.size} excluded).`);
}

main();
