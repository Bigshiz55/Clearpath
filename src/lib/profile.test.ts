import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPersonalContext, getPreferenceRules } from './profile';

/**
 * ANONYMOUS PERSONALIZATION / ACCOUNT-ISOLATION REGRESSION.
 *
 * `getPersonalContext` is the single place that decides whether a title page,
 * the Finder, Watch Now, the Mentalist, or Ask the Judge is allowed to show
 * anything framed as "your taste" at all. The bug this guards against: a
 * brand-new/anonymous user with zero `preference_rules` rows used to
 * silently get DEFAULT_NEW_USER_RULES (a real +6/+6/+6 crime/thriller/
 * mystery bias) applied and labeled "Your Match" / "a strong personal
 * match" — indistinguishable from genuine personalization. This suite
 * proves: (a) a zero-signal user gets `hasSignal: false`, `rules: []`, and
 * the neutral "General Verdict" label, never the default rule set; (b) a
 * user with real rules or liked franchises gets `hasSignal: true` and their
 * own data, unaffected; (c) every query is scoped to the caller's own
 * `user_id`, never another account's.
 */

interface Row {
  [key: string]: unknown;
}

/** A chainable mock Supabase client returning configured rows per table, and
 *  recording every `.eq(col,val)` filter so isolation can be asserted. */
function mockClient(tables: Record<string, Row[] | Row | null>) {
  const eqCalls: { table: string; col: string; val: unknown }[] = [];
  let currentTable = '';
  let currentCols = '';
  const builder: Record<string, unknown> = {};
  const chain = (fn?: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      fn?.(...args);
      return builder;
    };
  const resolveMany = () => {
    const rows = tables[currentTable];
    const data = Array.isArray(rows) ? rows : rows ? [rows] : [];
    return Promise.resolve({ data, error: null });
  };
  const resolveOne = () => {
    const rows = tables[currentTable];
    const row = Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null);
    return Promise.resolve({ data: row, error: null });
  };
  Object.assign(builder, {
    select: chain((cols: unknown) => {
      currentCols = String(cols);
    }),
    eq: chain((col: unknown, val: unknown) => eqCalls.push({ table: currentTable, col: String(col), val })),
    maybeSingle: () => resolveOne(),
    single: () => resolveOne(),
    then: (res: (v: unknown) => void) => resolveMany().then(res),
  });
  const client = {
    from(table: string) {
      currentTable = table;
      void currentCols;
      return builder as unknown;
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

const USER = 'user-fresh-anon-1';
const OTHER = 'user-someone-else-2';

describe('getPersonalContext — zero-signal viewers never get a fake personal result', () => {
  it('a brand-new user with zero preference_rules rows and no liked franchises gets hasSignal: false, empty rules, and "General Verdict"', async () => {
    const { client, eqCalls } = mockClient({
      profiles: { id: USER, display_name: 'Guest', personal_label: 'Your Match', liked_franchise_ids: [] },
      preference_rules: [],
    });
    const ctx = await getPersonalContext(client, USER, null);
    expect(ctx.hasSignal).toBe(false);
    expect(ctx.rules).toEqual([]);
    expect(ctx.label).toBe('General Verdict');
    // Never the pre-baked "Your Match" personal_label from the profile row —
    // that must only surface once hasSignal is true.
    expect(ctx.label).not.toBe('Your Match');
    // And every query stayed scoped to this exact user, not some other id.
    for (const call of eqCalls) {
      if (call.col === 'user_id' || call.col === 'id') expect(call.val).toBe(USER);
    }
  });

  it('a user with no profile row at all (mid-guest-creation) still gets a safe, neutral General Verdict', async () => {
    const { client } = mockClient({ profiles: null, preference_rules: [] });
    const ctx = await getPersonalContext(client, USER, null);
    expect(ctx.hasSignal).toBe(false);
    expect(ctx.rules).toEqual([]);
    expect(ctx.label).toBe('General Verdict');
  });

  it('DEFAULT_NEW_USER_RULES never leaks into a zero-signal context', async () => {
    const { client } = mockClient({
      profiles: { id: USER, display_name: null, personal_label: null, liked_franchise_ids: [] },
      preference_rules: [],
    });
    const ctx = await getPersonalContext(client, USER, null);
    expect(ctx.rules.length).toBe(0);
  });
});

describe('getPersonalContext — a real signal user is unaffected', () => {
  it('real preference_rules rows produce hasSignal: true and the user’s own rules', async () => {
    const { client } = mockClient({
      profiles: { id: USER, display_name: 'Dana', personal_label: null, liked_franchise_ids: [] },
      preference_rules: [
        { id: 'r1', trait: 'grounded_crime', weight: 8, requires_defining: false, label: 'Grounded crime' },
      ],
    });
    const ctx = await getPersonalContext(client, USER, null);
    expect(ctx.hasSignal).toBe(true);
    expect(ctx.rules.length).toBe(1);
    expect(ctx.rules[0]!.trait).toBe('grounded_crime');
    expect(ctx.label).toBe('Dana Match');
  });

  it('liked franchises alone (no rules) also count as real signal', async () => {
    const { client } = mockClient({
      profiles: { id: USER, display_name: 'Dana', personal_label: null, liked_franchise_ids: [760161] },
      preference_rules: [],
    });
    const ctx = await getPersonalContext(client, USER, null);
    expect(ctx.hasSignal).toBe(true);
    expect(ctx.likedFranchiseIds).toEqual([760161]);
  });

  it('queries never cross into another user’s rows', async () => {
    const { client, eqCalls } = mockClient({
      profiles: { id: USER, display_name: 'Dana', personal_label: null, liked_franchise_ids: [] },
      preference_rules: [{ id: 'r1', trait: 'grounded_crime', weight: 8, requires_defining: false, label: null }],
    });
    await getPersonalContext(client, USER, null);
    const scoped = eqCalls.filter((c) => c.col === 'user_id' || c.col === 'id');
    expect(scoped.length).toBeGreaterThan(0);
    const otherId: string = OTHER;
    expect(scoped.every((c) => c.val === USER && c.val !== otherId)).toBe(true);
  });
});

describe('getPreferenceRules — the editable-template accessor stays separate from scoring', () => {
  it('still returns the starting template for Settings when a user has zero rows (not a scoring path)', async () => {
    const { client } = mockClient({ preference_rules: [] });
    const rules = await getPreferenceRules(client, USER);
    expect(rules.length).toBeGreaterThan(0);
  });
});
