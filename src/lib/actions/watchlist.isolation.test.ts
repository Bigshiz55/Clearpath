import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

/**
 * ACCOUNT ISOLATION — application-layer proof, same pattern as
 * src/lib/founder/isolation.test.ts. `watchlist_items` RLS already enforces
 * `user_id = auth.uid()` (supabase/migrations/0001_init.sql), but
 * updateWatchlistItem/removeWatchlistItem used to filter their
 * update/delete only by the row's own `id` — no redundant application-level
 * ownership check. This proves the fix: every mutation this file issues now
 * filters by BOTH the row id AND the caller's own user_id, so a future RLS
 * regression wouldn't silently reopen a cross-user write.
 */
function mockClient(userId: string) {
  const eqCalls: { table: string; op: string; col: string; val: unknown }[] = [];
  let currentTable = '';
  let currentOp = '';
  const thenable = () => Promise.resolve({ data: null, error: null });
  const builder: Record<string, unknown> = {};
  const chain = (opName?: string) =>
    (...args: unknown[]) => {
      if (opName) currentOp = opName;
      return builder;
    };
  Object.assign(builder, {
    update: chain('update'),
    delete: chain('delete'),
    eq: (col: unknown, val: unknown) => {
      eqCalls.push({ table: currentTable, op: currentOp, col: String(col), val });
      return builder;
    },
    then: (res: (v: unknown) => void) => thenable().then(res),
  });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
    from(table: string) {
      currentTable = table;
      currentOp = '';
      return builder as unknown;
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

const USER = 'user-aaa-111';

describe('watchlist mutations are scoped to the authenticated user', () => {
  it('updateWatchlistItem filters by both item id and the caller\'s own user_id', async () => {
    vi.resetModules();
    const { client, eqCalls } = mockClient(USER);
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => client }));
    const mod = await import('./watchlist');
    const res = await mod.updateWatchlistItem({ itemId: '11111111-1111-1111-1111-111111111111', rating: 8 });
    expect(res.ok).toBe(true);
    const userScoped = eqCalls.filter((c) => c.table === 'watchlist_items' && c.op === 'update' && c.col === 'user_id');
    expect(userScoped).toHaveLength(1);
    expect(userScoped[0]!.val).toBe(USER);
    const idScoped = eqCalls.filter((c) => c.table === 'watchlist_items' && c.op === 'update' && c.col === 'id');
    expect(idScoped).toHaveLength(1);
  });

  it("removeWatchlistItem filters by both item id and the caller's own user_id", async () => {
    vi.resetModules();
    const { client: c, eqCalls } = mockClient(USER);
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => c }));
    const mod = await import('./watchlist');
    const res = await mod.removeWatchlistItem('22222222-2222-2222-2222-222222222222');
    expect(res.ok).toBe(true);
    const userScoped = eqCalls.filter((c2) => c2.table === 'watchlist_items' && c2.op === 'delete' && c2.col === 'user_id');
    expect(userScoped).toHaveLength(1);
    expect(userScoped[0]!.val).toBe(USER);
    const idScoped = eqCalls.filter((c2) => c2.table === 'watchlist_items' && c2.op === 'delete' && c2.col === 'id');
    expect(idScoped).toHaveLength(1);
  });
});
