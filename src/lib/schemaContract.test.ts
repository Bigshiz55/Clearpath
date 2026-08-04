import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_CONTRACT, UNMAPPED_OBJECTS, requiredObjects, migrationFor } from './schemaContract';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * THE GAP THAT LET MIGRATION 0041 SHIP.
 *
 * The migration was written, registered, reviewed and merged; the code that
 * reads its four tables went to production; the tables were never created.
 * Nothing objected, because nothing compared what the code needs against what
 * the database has. These tests hold the code-side half of that comparison.
 */
describe('every database object the code uses is declared', () => {
  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${e}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) sourceFiles(rel, acc);
      else if (/\.tsx?$/.test(e) && !e.includes('.test.')) acc.push(rel);
    }
    return acc;
  }

  const used = new Set<string>();
  for (const f of sourceFiles('src')) {
    for (const m of stripComments(read(f)).matchAll(/\.from\('([a-z_]+)'\)/g)) used.add(m[1]!);
  }

  it('finds the real call sites (the sweep is not silently empty)', () => {
    expect(used.size).toBeGreaterThan(50);
  });

  it('leaves nothing undeclared — an undeclared object is one no gate can check', () => {
    const declared = new Set([...requiredObjects(), ...UNMAPPED_OBJECTS]);
    expect([...used].filter((o) => !declared.has(o))).toEqual([]);
  });

  it('names a real migration file for every contracted object', () => {
    const files = new Set(
      readdirSync(join(process.cwd(), 'supabase/migrations'))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => f.replace(/\.sql$/, '')),
    );
    for (const r of SCHEMA_CONTRACT) expect(files.has(r.migration), `${r.object} -> ${r.migration}`).toBe(true);
  });
});

describe('the four tables 0041 creates are contracted', () => {
  it('points each at 0041, so a live probe can name the migration to apply', () => {
    for (const t of ['watchmode_availability', 'watchmode_fetch_state', 'watchmode_title_map', 'watchmode_call_ledger']) {
      expect(migrationFor(t), t).toBe('0041_watchmode_availability');
    }
  });
});

describe('both gates exist and are wired', () => {
  it('the offline contract check runs as part of the build', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toContain('check:schema');
    expect(pkg.scripts['check:schema']).toContain('checkSchemaContract');
  });

  it('the live probe is runnable against a deployment and needs no credentials', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:schema']).toContain('verifyProductionSchema');
    const s = read('scripts/verifyProductionSchema.ts');
    expect(s).toContain('/api/health/schema');
    expect(s).toContain('process.exit(1)');
    // A gate that needs a secret is a gate that gets skipped in CI.
    expect(stripComments(s)).not.toMatch(/SERVICE_ROLE|MIGRATE_SECRET|SUPABASE_DB_URL/);
  });

  it('the health endpoint reports missing objects and the migration to apply', () => {
    const s = read('src/app/api/health/schema/route.ts');
    expect(s).toContain('unappliedMigrations');
    expect(s).toContain('migrationFor');
    expect(s).toMatch(/status: ok \? 200 : 503/);
  });

  it('the health endpoint returns booleans about configuration, never values', () => {
    const code = stripComments(read('src/app/api/health/schema/route.ts'));
    expect(code).toContain('Boolean(serverEnv.migrationsDbUrl())');
    // The URL, the key and the secret must never be in the response body.
    expect(code).not.toMatch(/migrationsDbUrl\(\)\s*[,}]/);
    expect(code).not.toMatch(/migrateSecret\(\)\s*[,}]/);
  });

  it('is read-only — a health check must not mutate the schema it reports on', () => {
    const code = stripComments(read('src/app/api/health/schema/route.ts')).toLowerCase();
    for (const w of ['insert', 'update(', 'delete(', 'create table', 'alter table']) {
      expect(code, w).not.toContain(w);
    }
  });
});

describe('the build gate actually runs where the build actually happens', () => {
  it('vercel.json runs it too — package.json alone is not enough', () => {
    // vercel.json OVERRIDES package.json's build script. The gate was added to
    // package.json first and was therefore inert on the only build that
    // matters. Caught by reading vercel.json rather than by trusting the
    // npm script.
    const vercel = JSON.parse(read('vercel.json')) as { buildCommand?: string };
    expect(vercel.buildCommand).toBeDefined();
    expect(vercel.buildCommand).toContain('check:schema');
  });

  it('a migration can be proven against real Postgres before production', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['prove:migration']).toContain('proveMigration');
    const s = read('scripts/proveMigration.ts');
    // Applying twice is what turns "claims to be idempotent" into evidence.
    expect(s).toContain('re-applied (idempotent)');
  });
});
