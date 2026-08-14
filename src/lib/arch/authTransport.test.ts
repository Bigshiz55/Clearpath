import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * HOW THIS APPLICATION CARRIES A SESSION — pinned, because a test harness got
 * it wrong and would have "proved" the product worked while proving nothing.
 *
 * The CI black-box gate signed a test user in against Supabase, took the
 * `access_token`, and sent it to `/api/ask` as `Authorization: Bearer …`. That
 * is how a Supabase REST client authenticates, and it is NOT how this app does.
 * `createClient()` builds `createServerClient` with a `cookies` adapter and
 * nothing else, and the middleware reads `request.cookies`. Neither ever looks
 * at an Authorization header, so a bearer-only request is anonymous — and the
 * gate would have reported 401 forever while looking like a product failure.
 *
 * These tests pin the transport so the mistake cannot be made twice, in either
 * direction:
 *
 *   1. The server client is cookie-bound. If someone adds a bearer passthrough
 *      they have created a SECOND authentication mechanism for the whole
 *      product — a much larger change than a test harness needs — and this
 *      fails until that is a deliberate, reviewed decision.
 *   2. A test harness therefore must obtain real cookies, not a token.
 *
 * Source-level on purpose: executing the route needs a deployment, and the
 * claim here is about how the code is wired, which the source states exactly.
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the session transport is cookies, not bearer tokens', () => {
  it('the server client is constructed with a cookie adapter', () => {
    const src = read('src/lib/supabase/server.ts');
    expect(src).toContain('createServerClient');
    expect(src).toContain('cookies');
    expect(src).toMatch(/getAll\s*\(/);
  });

  it('the server client does NOT accept an Authorization header', () => {
    /*
     * The failing-first assertion. `@supabase/ssr` only reads a bearer token if
     * the caller passes `global.headers.Authorization`; this client does not,
     * so `auth.getUser()` resolves from the cookie store alone.
     *
     * If this ever fails, do not "fix" the test — a bearer path would be a
     * second production auth mechanism, and it needs to be argued for on its
     * own merits rather than arriving as a side effect of making CI green.
     */
    const src = read('src/lib/supabase/server.ts');
    expect(src, 'a bearer passthrough appeared in the server client').not.toMatch(
      /global\s*:\s*\{[^}]*headers/s,
    );
    expect(src, 'the server client now reads an Authorization header').not.toMatch(/Authorization/i);
  });

  it('the middleware also resolves the session from cookies alone', () => {
    const src = read('src/lib/supabase/middleware.ts');
    expect(src).toMatch(/request\.cookies/);
    expect(src, 'the middleware now reads an Authorization header').not.toMatch(/Authorization/i);
  });

  it('/api/ask verifies identity through that cookie-bound client', () => {
    // `getUser()` revalidates the token rather than trusting a stored session,
    // which is the repo's stated rule — and it is reached via `createClient()`,
    // so the cookie is the only thing that can carry the caller's identity.
    const src = read('src/app/api/ask/route.ts');
    expect(src).toMatch(/createClient\(\)/);
    expect(src).toMatch(/auth\.getUser\(\)/);
    expect(src).toMatch(/401/);
  });

  it('no route grants access from a raw Authorization header', () => {
    /*
     * A repo-wide sweep, because the danger is not this file changing — it is
     * a NEW route quietly accepting a bearer token and becoming a second front
     * door that the cookie-based gates never see.
     */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name === 'route.ts') {
          const src = read(rel);
          // Reading a header is fine; using it to establish a USER is not.
          if (/headers\(\)\.get\(['"]authorization/i.test(src) && /auth|user|session/i.test(src)) {
            // Cron/webhook shared-secret checks are a different thing entirely
            // and never resolve to a user identity.
            if (!/CRON_SECRET|webhook|signature/i.test(src)) offenders.push(rel);
          }
        }
      }
    };
    walk('src/app/api');
    expect(offenders, `these routes authenticate a user from a bearer header: ${offenders.join(', ')}`).toEqual([]);
  });
});
