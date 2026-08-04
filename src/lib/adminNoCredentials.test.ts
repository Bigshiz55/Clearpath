import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_MIGRATIONS } from './pendingMigrations';
import { EXCLUDED_MIGRATIONS, WITHDRAWN_MIGRATIONS } from './excludedMigrations';

/**
 * TWO STANDING GUARANTEES, ENFORCED AT SOURCE LEVEL.
 *
 *  1. The browser-based admin workflow collects no production credential of
 *     any kind, and the routes behind it accept none.
 *  2. Migration 0042 cannot reach a database through any runner while it
 *     targets a table production does not have.
 *
 * Both are the kind of thing that gets quietly reintroduced by a later
 * "convenience" change, which is exactly why they are asserted rather than
 * documented. See docs/SCHEMA_DRIFT_0042.md.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** These files DESCRIBE the credentials they must never handle, so prose
 *  would otherwise trip the assertions guarding the code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Every `NextResponse.json(...)` argument list, matched by balancing
 * parentheses rather than by regex — a regex either misses the single-line
 * calls or bleeds past the multi-line ones into unrelated code, and both
 * failure modes make the assertion below meaningless.
 */
function responseBodies(src: string): string[] {
  const out: string[] = [];
  const marker = 'NextResponse.json(';
  for (let i = src.indexOf(marker); i !== -1; i = src.indexOf(marker, i + 1)) {
    let depth = 1;
    let j = i + marker.length;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') depth--;
    }
    out.push(src.slice(i + marker.length, j - 1));
  }
  return out;
}

const applyUi = read('src/components/admin/ApplyMigrationsButton.tsx');
const applyCode = stripComments(applyUi);
const pageCode = stripComments(read('src/app/admin/migrations/page.tsx'));
const migrateRoute = read('src/app/api/admin/migrate/route.ts');
const migrateCode = stripComments(migrateRoute);

describe('the admin page collects no credentials', () => {
  it('has no input element at all — there is nowhere to type one', () => {
    expect(applyCode).not.toMatch(/<input/i);
    expect(pageCode).not.toMatch(/<input/i);
  });

  it('has no password field and no credential-named state', () => {
    expect(applyCode).not.toMatch(/type="password"/);
    for (const field of ['password', 'setPassword', 'dbUrl', 'setDbUrl', 'setHost', 'setToken']) {
      expect(applyCode, field).not.toContain(field);
    }
  });

  it('never names a secret env var in client code', () => {
    for (const src of [applyCode, pageCode]) {
      expect(src).not.toMatch(/MIGRATE_SECRET|SERVICE_ROLE|SUPABASE_DB_URL|MIGRATIONS_DB_URL/i);
    }
  });

  it('sends an empty body — nothing a caller could inject a connection into', () => {
    expect(applyCode).toMatch(/body: '\{\}'/);
    expect(applyCode).not.toMatch(/JSON\.stringify\(payload\)/);
    // No Authorization HEADER — the word appears in visible copy explaining
    // that the session authorizes the request, which is the opposite claim.
    expect(applyCode).not.toMatch(/Authorization['"]?\s*:/);
  });
});

describe('the migrate route accepts no credentials from the request', () => {
  it('never reads connection fields or a secret out of the body', () => {
    for (const field of ['body.host', 'body.port', 'body.user', 'body.password', 'body.database', 'body.dbUrl', 'body.secret']) {
      expect(migrateCode, field).not.toContain(field);
    }
    // Not even parsed: there is no body object to read from.
    expect(migrateCode).not.toMatch(/await request\.json\(\)/);
  });

  it('connects only from server-side configuration', () => {
    expect(migrateCode).toContain('serverEnv.migrationsDbUrl()');
    expect(migrateCode).not.toMatch(/host:\s*body/);
  });

  it('is dormant with a readable reason instead of offering a field', () => {
    expect(migrateRoute).toMatch(/no database connection configured[\s\S]{0,400}status: 503/i);
    expect(migrateRoute).toMatch(/never accepted from the browser/i);
  });

  it('never echoes the configured URL back to the caller', () => {
    // Asserted against the RESPONSE BODIES specifically. `dbUrl` legitimately
    // appears when building the pg client config; what must never happen is
    // it reaching a NextResponse.
    const responses = responseBodies(migrateCode);
    expect(responses.length).toBeGreaterThan(3);
    for (const body of responses) expect(body).not.toContain('dbUrl');
  });
});

describe('0042 cannot reach a database through any runner', () => {
  const names = new Set(PENDING_MIGRATIONS.map((m) => m.name));

  it('is not registered for the runner', () => {
    expect(names.has('0042_canonical_availability')).toBe(false);
  });

  it('is excluded deliberately, with the reason recorded', () => {
    const reason = EXCLUDED_MIGRATIONS['0042_canonical_availability'];
    expect(reason).toBeDefined();
    expect(reason).toMatch(/watchmode_availability/);
    expect(reason).toMatch(/SCHEMA_DRIFT_0042/);
  });

  it('every runner reads the same two lists, so excluding it blocks all of them', () => {
    expect(read('scripts/migrate.ts')).toContain('PENDING_MIGRATIONS');
    expect(migrateRoute).toContain('PENDING_MIGRATIONS');
  });

  it('the .sql file is kept — withdrawn for correction, not deleted', () => {
    expect(() => read('supabase/migrations/0042_canonical_availability.sql')).not.toThrow();
  });

  it('is reported as withdrawn by /api/version, not advertised as the newest migration', () => {
    // latestMigrationInCode is a filename scan, so 0042 is still the newest
    // FILE. Without this field it would read as the intended target state.
    expect(WITHDRAWN_MIGRATIONS['0042_canonical_availability']).toBeDefined();
    const version = read('src/app/api/version/route.ts');
    expect(version).toContain('withdrawnMigrations');
    expect(version).toContain('WITHDRAWN_MIGRATIONS');
  });

  it('withdrawn means defective, not retired — the categories stay distinct', () => {
    // Retired/baseline exclusions are expected never to return; a withdrawn
    // migration is expected back once corrected. Collapsing them would lose
    // the only signal that 0042 still needs work.
    expect(WITHDRAWN_MIGRATIONS['0033_voice_dna']).toBeUndefined();
    expect(WITHDRAWN_MIGRATIONS['0001_init']).toBeUndefined();
    // But every withdrawn migration is still excluded from the runners.
    for (const name of Object.keys(WITHDRAWN_MIGRATIONS)) {
      expect(EXCLUDED_MIGRATIONS[name], name).toBeDefined();
    }
  });

  it('0041 stays registered — it is genuinely pending, not defective', () => {
    expect(names.has('0041_watchmode_availability')).toBe(true);
    expect(EXCLUDED_MIGRATIONS['0041_watchmode_availability']).toBeUndefined();
  });
});

describe('the runner documentation no longer claims migrations run at build', () => {
  it('scripts/migrate.ts says so explicitly', () => {
    const s = read('scripts/migrate.ts');
    expect(s).toMatch(/NOT RUN AUTOMATICALLY/);
    expect(s).toMatch(/supabase_migrations\.schema_migrations/);
  });

  it('pendingMigrations.ts distinguishes registered from applied', () => {
    const s = read('src/lib/pendingMigrations.ts');
    expect(s).toMatch(/NOT RUN AT BUILD TIME/);
    expect(s).toMatch(/REGISTERED, never/);
  });

  it('the build command genuinely does not run migrations — asserted, not assumed', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).not.toContain('migrate');
  });
});
