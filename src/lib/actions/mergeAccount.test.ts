import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

/**
 * RELIABILITY SPRINT — item 7, the most severe finding: an anonymous
 * visitor's Watch DNA quiz answers and FOR/AGAINST verdicts (preference_events,
 * recommendation_feedback[_events], dimension_signals) used to be silently
 * destroyed on first sign-in. `performMerge` only ever moved watchlist_items
 * + profile, then deleted the anonymous auth.users row — every one of those
 * signal tables has `on delete cascade`. Worse, `autoMergeIfSafe` deleted the
 * anonymous user immediately whenever `anonItemCount === 0`, which is exactly
 * the case for a visitor who only did the quiz/verdicts and never saved
 * anything — no merge was ever attempted for them at all.
 *
 * This proves: (a) anonSignalCount is computed and included in the merge
 * decision, so a signal-only anonymous session is no longer treated as
 * "nothing to merge"; (b) performMerge actually moves preference_events and
 * recommendation_feedback_events; (c) recommendation_feedback dedupes by
 * (tmdb_id, media_type) like watchlist items do; (d) dimension_signals sums
 * when both sides have a row for the same dimension, and reassigns when only
 * the anonymous side does.
 */

type Row = Record<string, unknown>;

interface MockOpts {
  anonUserId: string;
  targetUserId: string;
  counts: Record<string, { anon: number; target: number }>;
  anonRows: Record<string, Row[]>;
  targetRows: Record<string, Row[]>;
}

function buildAdminMock(opts: MockOpts) {
  const updates: { table: string; payload: Row; eqCalls: [string, unknown][] }[] = [];
  const deletedUsers: string[] = [];

  function tableBuilder(table: string) {
    const eqCalls: [string, unknown][] = [];
    let mode: 'select-count' | 'select-rows' | 'update' | 'insert' | null = null;
    let updatePayload: Row = {};
    let insertPayload: Row = {};
    let selectCols = '';

    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: (cols: unknown, opts2?: { count?: string; head?: boolean }) => {
        selectCols = String(cols);
        if (mode !== 'insert') mode = opts2?.head ? 'select-count' : 'select-rows';
        return b;
      },
      update: (payload: Row) => {
        mode = 'update';
        updatePayload = payload;
        return b;
      },
      insert: (payload: Row) => {
        mode = 'insert';
        insertPayload = payload;
        return b;
      },
      eq: (col: unknown, val: unknown) => {
        eqCalls.push([String(col), val]);
        return b;
      },
      in: (col: unknown, vals: unknown) => {
        eqCalls.push([String(col), vals]);
        if (mode === 'update') {
          updates.push({ table, payload: updatePayload, eqCalls: [...eqCalls] });
          return Promise.resolve({ data: null, error: null });
        }
        return b;
      },
      maybeSingle: () => resolveSingle(),
      single: () => resolveSingle(),
      then: (res: (v: unknown) => void) => {
        if (mode === 'update') {
          updates.push({ table, payload: updatePayload, eqCalls: [...eqCalls] });
          return Promise.resolve({ data: null, error: null }).then(res);
        }
        if (mode === 'insert') {
          return Promise.resolve({ data: { id: `new-${table}-id`, ...insertPayload }, error: null }).then(res);
        }
        const userIdEq = eqCalls.find(([col]) => col === 'user_id');
        const forUser = userIdEq?.[1] === opts.anonUserId ? 'anon' : userIdEq?.[1] === opts.targetUserId ? 'target' : null;
        if (mode === 'select-count') {
          const count = forUser ? (opts.counts[table]?.[forUser] ?? 0) : 0;
          return Promise.resolve({ data: null, error: null, count }).then(res);
        }
        // select-rows
        const rows = forUser === 'anon' ? (opts.anonRows[table] ?? []) : forUser === 'target' ? (opts.targetRows[table] ?? []) : [];
        void selectCols;
        return Promise.resolve({ data: rows, error: null }).then(res);
      },
    });

    function resolveSingle() {
      if (mode === 'insert') return Promise.resolve({ data: { id: `new-${table}-id`, ...insertPayload }, error: null });
      const userIdEq = eqCalls.find(([col]) => col === 'user_id' || col === 'id');
      const forUser = userIdEq?.[1] === opts.anonUserId ? 'anon' : userIdEq?.[1] === opts.targetUserId ? 'target' : null;
      const rows = forUser === 'anon' ? (opts.anonRows[table] ?? []) : forUser === 'target' ? (opts.targetRows[table] ?? []) : [];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    }
    return b;
  }

  const admin = {
    from: (table: string) => tableBuilder(table),
    auth: {
      admin: {
        getUserById: async (id: string) =>
          id === opts.anonUserId
            ? { data: { user: { id, is_anonymous: true } }, error: null }
            : { data: null, error: { message: 'not found' } },
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { data: null, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;

  return { admin, updates, deletedUsers };
}

const ANON = 'anon-user-1';
const TARGET = 'target-user-1';

function mockTarget(): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: TARGET, is_anonymous: false } } }) },
  } as unknown as SupabaseClient;
}

async function loadMergeAccount(admin: SupabaseClient, target: SupabaseClient) {
  vi.resetModules();
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }));
  vi.doMock('@/lib/supabase/server', () => ({ createClient: () => target }));
  return import('./mergeAccount');
}

describe('getMergePreview — anonSignalCount catches quiz/verdict-only anonymous sessions', () => {
  it('is nonzero when the anonymous session has DNA signal rows but zero watchlist items', async () => {
    const { admin } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 5, target: 0 },
        recommendation_feedback: { anon: 2, target: 0 },
        dimension_signals: { anon: 3, target: 0 },
      },
      anonRows: {},
      targetRows: {},
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    const preview = await mod.getMergePreview(ANON);
    expect(preview?.anonItemCount).toBe(0);
    expect(preview?.anonSignalCount).toBe(10); // 5 + 2 + 3
  });
});

describe('autoMergeIfSafe — a signal-only anonymous session is never silently deleted', () => {
  it('does NOT take the "nothing to merge, delete" branch when anonItemCount is 0 but signals exist', async () => {
    const { admin, deletedUsers } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 4, target: 0 },
        recommendation_feedback: { anon: 0, target: 0 },
        dimension_signals: { anon: 0, target: 0 },
      },
      anonRows: { preference_events: [], recommendation_feedback: [], dimension_signals: [] },
      targetRows: { recommendation_feedback: [], dimension_signals: [] },
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    const result = await mod.autoMergeIfSafe(ANON);
    // Target has zero watchlist items too, so this is safe to auto-merge —
    // the point is it does NOT land on the old "no_anon_data, just delete"
    // shortcut, which used to fire (and delete) before a merge was even
    // attempted whenever anonItemCount was 0.
    expect(result.status).toBe('merged');
    expect(deletedUsers).toContain(ANON); // still cleaned up, but only AFTER moving the signal
  });

  it('still takes the "nothing to merge" branch when there is truly nothing on either count', async () => {
    const { admin, deletedUsers } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 0, target: 0 },
        recommendation_feedback: { anon: 0, target: 0 },
        dimension_signals: { anon: 0, target: 0 },
      },
      anonRows: {},
      targetRows: {},
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    const result = await mod.autoMergeIfSafe(ANON);
    expect(result.status).toBe('no_anon_data');
    expect(deletedUsers).toContain(ANON);
  });
});

describe('performMerge — DNA/verdict signals actually move, not just watchlist + profile', () => {
  it('bulk-reassigns preference_events and recommendation_feedback_events to the target user', async () => {
    const { admin, updates } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 1, target: 0 },
        recommendation_feedback: { anon: 0, target: 0 },
        dimension_signals: { anon: 0, target: 0 },
      },
      anonRows: { recommendation_feedback: [], dimension_signals: [] },
      targetRows: { recommendation_feedback: [], dimension_signals: [] },
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    const res = await mod.performMerge(ANON);
    expect(res.ok).toBe(true);

    const prefEventsUpdate = updates.find((u) => u.table === 'preference_events');
    expect(prefEventsUpdate?.payload).toEqual({ user_id: TARGET });
    expect(prefEventsUpdate?.eqCalls).toContainEqual(['user_id', ANON]);

    const feedbackEventsUpdate = updates.find((u) => u.table === 'recommendation_feedback_events');
    expect(feedbackEventsUpdate?.payload).toEqual({ user_id: TARGET });
    expect(feedbackEventsUpdate?.eqCalls).toContainEqual(['user_id', ANON]);
  });

  it('recommendation_feedback: keeps the target\'s own row and only moves non-colliding anon rows', async () => {
    const { admin, updates } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 0, target: 0 },
        recommendation_feedback: { anon: 2, target: 1 },
        dimension_signals: { anon: 0, target: 0 },
      },
      anonRows: {
        recommendation_feedback: [
          { id: 'fb-1', tmdb_id: 100, media_type: 'movie' }, // collides with target's own
          { id: 'fb-2', tmdb_id: 200, media_type: 'movie' }, // no collision — should move
        ],
        dimension_signals: [],
      },
      targetRows: {
        recommendation_feedback: [{ tmdb_id: 100, media_type: 'movie' }],
        dimension_signals: [],
      },
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    await mod.performMerge(ANON);

    const feedbackMoves = updates.filter((u) => u.table === 'recommendation_feedback' && u.payload.user_id === TARGET);
    expect(feedbackMoves).toHaveLength(1);
    const inCall = feedbackMoves[0]!.eqCalls.find(([col]) => col === 'id');
    expect(inCall?.[1]).toEqual(['fb-2']); // only the non-colliding row moves
  });

  it('dimension_signals: sums w_sum/wv_sum when both sides have the same dimension_key', async () => {
    const { admin, updates } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 0, target: 0 },
        recommendation_feedback: { anon: 0, target: 0 },
        dimension_signals: { anon: 1, target: 1 },
      },
      anonRows: {
        recommendation_feedback: [],
        dimension_signals: [{ dimension_key: 'pace', w_sum: 2, wv_sum: 5 }],
      },
      targetRows: {
        recommendation_feedback: [],
        dimension_signals: [{ dimension_key: 'pace', w_sum: 3, wv_sum: 7 }],
      },
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    await mod.performMerge(ANON);

    const dimUpdate = updates.find((u) => u.table === 'dimension_signals' && (u.payload.w_sum != null));
    expect(dimUpdate?.payload).toEqual({ w_sum: 5, wv_sum: 12 }); // 2+3, 5+7
    expect(dimUpdate?.eqCalls).toContainEqual(['user_id', TARGET]);
    expect(dimUpdate?.eqCalls).toContainEqual(['dimension_key', 'pace']);
  });

  it('dimension_signals: reassigns (never sums) when only the anonymous side has that dimension', async () => {
    const { admin, updates } = buildAdminMock({
      anonUserId: ANON,
      targetUserId: TARGET,
      counts: {
        watchlist_items: { anon: 0, target: 0 },
        preference_events: { anon: 0, target: 0 },
        recommendation_feedback: { anon: 0, target: 0 },
        dimension_signals: { anon: 1, target: 0 },
      },
      anonRows: {
        recommendation_feedback: [],
        dimension_signals: [{ dimension_key: 'tone', w_sum: 4, wv_sum: 9 }],
      },
      targetRows: { recommendation_feedback: [], dimension_signals: [] },
    });
    const mod = await loadMergeAccount(admin, mockTarget());
    await mod.performMerge(ANON);

    const dimReassign = updates.find((u) => u.table === 'dimension_signals' && u.payload.user_id === TARGET);
    expect(dimReassign?.eqCalls).toContainEqual(['user_id', ANON]);
    expect(dimReassign?.eqCalls).toContainEqual(['dimension_key', 'tone']);
  });
});
