import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * THE DIAGNOSTIC MUST NOT BECOME THE HOLE.
 *
 * A read-only admin endpoint that reports counts is exactly the kind of thing
 * that gets added under time pressure without a gate, and this codebase has
 * already shipped one broken TV diagnostic that returned 200 with an error body
 * nobody read. These pin the two properties that make it safe to exist: it is
 * authorised by the same door as every other admin route, and it cannot write.
 */

const ROUTE = 'src/app/api/admin/packs/eligibility/route.ts';

describe('the pack eligibility diagnostic is admin-gated and read-only', () => {
  const src = readFileSync(ROUTE, 'utf8');

  it('authorises before it touches anything', () => {
    expect(src).toContain('authorizeTvAdmin');
    expect(src).toMatch(/status:\s*403/);

    /* COMPARED INSIDE THE HANDLER, NOT ACROSS THE FILE. The first version of
       this compared `indexOf` over the whole source and was really comparing
       two import lines, which say nothing about execution order — it would have
       passed for a route that authorised after querying. */
    const handler = src.slice(src.indexOf('export async function GET'));
    const gate = handler.indexOf('await authorizeTvAdmin');
    const firstDbCall = handler.indexOf('createAdminClient(');
    expect(gate, 'no authorize call inside the handler').toBeGreaterThan(-1);
    expect(firstDbCall, 'no db client created inside the handler').toBeGreaterThan(-1);
    expect(gate, 'the route reaches the database before it checks who is asking').toBeLessThan(
      firstDbCall,
    );
  });

  it('never writes', () => {
    /* It runs with the service-role client, which bypasses RLS. Read-only is
       the whole basis on which that is acceptable. */
    for (const mutation of ['.insert(', '.upsert(', '.update(', '.delete(', '.rpc(']) {
      expect(src.includes(mutation), `diagnostic performs ${mutation}`).toBe(false);
    }
  });

  it('exposes no user data', () => {
    // None of the tables it reads carry a user id, and it must stay that way.
    for (const table of ['watchlist_items', 'preference_events', 'user_seen_programmes', 'profiles']) {
      expect(src.includes(table), `diagnostic reads ${table}`).toBe(false);
    }
  });

  it('surfaces query errors instead of degrading into a healthy-looking zero', () => {
    /* THE PRECEDENT. A diagnostic in this repo once selected a column that did
       not exist; PostgREST returned 200 with an error body, the code read
       `data ?? []`, and it reported clean numbers for a broken query. */
    expect(src).toMatch(/status:\s*502/);
    expect(src).toContain('progErr');
    expect(src).toContain('airErr');
  });

  it('bounds its own query so it cannot become a table scan', () => {
    expect(src).toContain('MAX_AIRINGS');
    expect(src).toMatch(/\.limit\(/);
  });
});

describe('Crime Case Files makes no claim it cannot support', () => {
  const view = readFileSync('src/components/packs/CaseBrowserView.tsx', 'utf8');

  it('never writes a case link from a heuristic', () => {
    /* `case_programmes` is the join that says "these two programmes are the
       same real-world case". Inferring a row there would be fabricating the
       product's entire promise. */
    expect(view).toContain("from('case_programmes')");
    expect(view.includes('case_programmes').valueOf()).toBe(true);
    expect(view).not.toMatch(/case_programmes'\)\s*\.\s*(insert|upsert|update)/);
  });

  it('filters the pack to eligible programming', () => {
    expect(view).toContain('partitionEligible');
    expect(view).toContain('shapeForPack');
  });

  it('says linking is unavailable rather than implying it worked', () => {
    expect(view).toContain('cases-unlinked');
    expect(view).toMatch(/isn’t live yet|is not live yet/);
  });
});
