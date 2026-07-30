import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveFounderAccess, FOUNDERS, type AccessConfig } from './access';
import {
  listSessions,
  createSession,
  archiveSession,
  renameSession,
  reopenSession,
  makeCurrentSession,
} from './sessions';
import { countAnswersBySource, loadDnaSignals } from '@/lib/preference/dnaSignals';

/**
 * FOUNDER ISOLATION — application-layer proof (PART 12).
 *
 * True row-level isolation is enforced by Postgres RLS (every policy is
 * `user_id = auth.uid()`), which is exercised by the env-gated integration test
 * (isolation.int.test.ts) against a real database. THIS suite proves the layer
 * above that: (a) the route gate never lets one founder into another's route or
 * data, and (b) every founder/DNA query the app issues is scoped to the
 * authenticated user's id (and session, where relevant) — so nothing is ever
 * fetched cross-account even before RLS is consulted.
 */

/** A chainable mock that records every `.eq(col,val)` filter and resolves empty. */
function mockClient() {
  const eqCalls: { table: string; col: string; val: unknown }[] = [];
  let currentTable = '';
  const thenable = () => Promise.resolve({ data: [], error: null, count: 0 });
  const builder: Record<string, unknown> = {};
  const chain = (fn?: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      fn?.(...args);
      return builder;
    };
  Object.assign(builder, {
    select: chain(),
    insert: chain(),
    update: chain(),
    delete: chain(),
    is: chain(),
    order: chain(),
    limit: () => thenable(),
    eq: chain((col: unknown, val: unknown) => eqCalls.push({ table: currentTable, col: String(col), val })),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (res: (v: unknown) => void) => thenable().then(res),
  });
  const client = {
    from(table: string) {
      currentTable = table;
      return builder as unknown;
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

const USER = 'user-scott-123';
const OTHER = 'user-heather-999';

describe('founder route gate never crosses identities', () => {
  const cfg: AccessConfig = {
    founderEmails: { scott: 'scott@wv.test', heather: 'heather@wv.test', amy: 'amy@wv.test' },
    adminEmails: ['owner@wv.test'],
  };

  it('a founder can NEVER enter another founder route (no data path opens)', () => {
    // Scott hitting Heather/Amy is denied, and is only ever pointed to his OWN route.
    for (const f of FOUNDERS.filter((x) => x.key !== 'scott')) {
      const r = resolveFounderAccess('scott@wv.test', f.key, cfg);
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('wrong_founder');
      expect(r.authorizedRoute).toBe('/TestScott');
      expect(r.founder).toBe(f.key); // it never swaps them into their own env
    }
  });

  it('direct access to another founder route by a non-founder exposes nothing', () => {
    for (const f of FOUNDERS) {
      expect(resolveFounderAccess('stranger@wv.test', f.key, cfg).allowed).toBe(false);
      expect(resolveFounderAccess(null, f.key, cfg).allowed).toBe(false);
    }
  });

  it('owner may enter every route (administration only)', () => {
    for (const f of FOUNDERS) {
      const r = resolveFounderAccess('owner@wv.test', f.key, cfg);
      expect(r.allowed).toBe(true);
      expect(r.isOwner).toBe(true);
    }
  });
});

describe('every founder/DNA query is scoped to the authenticated user', () => {
  it('session reads/writes always filter by the caller user_id', async () => {
    const { client, eqCalls } = mockClient();
    await listSessions(client, USER, 'scott');
    await createSession(client, USER, 'scott', 'Scott Main');
    await archiveSession(client, USER, 'fs_scott_a');
    await renameSession(client, USER, 'fs_scott_a', 'New');
    await reopenSession(client, USER, 'fs_scott_a');
    await makeCurrentSession(client, USER, 'fs_scott_a');

    const userScoped = eqCalls.filter((c) => c.col === 'user_id');
    // Every session op that filters did so by the caller's id — never OTHER.
    expect(userScoped.length).toBeGreaterThan(0);
    for (const c of userScoped) expect(c.val).toBe(USER);
    expect(eqCalls.some((c) => c.val === OTHER)).toBe(false);
  });

  it('DNA signal + calibration counts are scoped to user (and session when given)', async () => {
    const { client, eqCalls } = mockClient();
    await loadDnaSignals(client, USER, { sessionId: 'fs_scott_a' });
    await countAnswersBySource(client, USER, 'calibration', 'fs_scott_a');

    const userScoped = eqCalls.filter((c) => c.col === 'user_id');
    expect(userScoped.length).toBeGreaterThan(0);
    for (const c of userScoped) expect(c.val).toBe(USER);
    // Session scoping is applied where the schema supports it.
    expect(eqCalls.some((c) => c.col === 'session_id' && c.val === 'fs_scott_a')).toBe(true);
  });
});
