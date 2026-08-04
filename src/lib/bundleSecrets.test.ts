import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO PRODUCTION SECRET MAY REACH THE CLIENT BUNDLE.
 *
 * Scans the real built output rather than the source, because the failure mode
 * is a build-time inlining mistake — a secret read through a NEXT_PUBLIC_ path,
 * or a server-only module accidentally imported into a client component. Source
 * review cannot catch that; the emitted JavaScript can.
 *
 * Skips when .next/static is absent so the suite still runs before a build.
 */
const STATIC_DIR = join(process.cwd(), '.next', 'static');

/** Shapes of real credentials — never their names, which legitimately appear
 *  in admin help text and input placeholders. */
const SECRET_VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // A populated Postgres URL: scheme + credentials + host. The admin page's
  // format EXAMPLE uses literal "..." and must not match.
  { name: 'postgres connection string with credentials', re: /postgres(?:ql)?:\/\/[^\s:"']+:(?!\.\.\.)[^\s@"']{6,}@[^\s"'/]+/ },
  // Supabase service-role JWTs carry this role claim.
  { name: 'service_role JWT claim', re: /"role"\s*:\s*"service_role"/ },
  { name: 'service_role literal', re: /service_role/ },
  // A long opaque secret assigned to a secret-named key.
  { name: 'inlined MIGRATE_SECRET value', re: /MIGRATE_SECRET["']?\s*[:=]\s*["'][^"']{8,}["']/ },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('client bundle contains no production secrets', () => {
  it('emits no credential-shaped value in any client chunk', () => {
    if (!existsSync(STATIC_DIR)) {
      expect(true).toBe(true); // not built in this run
      return;
    }
    const offenders: string[] = [];
    for (const file of walk(STATIC_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const { name, re } of SECRET_VALUE_PATTERNS) {
        if (re.test(src)) offenders.push(`${name} in ${file.replace(process.cwd(), '')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the session-authorized reconcile route is never bundled to the client', () => {
    if (!existsSync(STATIC_DIR)) return;
    for (const file of walk(STATIC_DIR)) {
      // pg is server-only; if it ever appears client-side, a server module leaked.
      expect(readFileSync(file, 'utf8')).not.toContain('pg_advisory_lock');
    }
  });
});
