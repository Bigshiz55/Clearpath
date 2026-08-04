import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

/**
 * RELIABILITY SPRINT — item 7, Netflix CSV import. `/import-taste`'s
 * "Undo this import" button used to just reset local component state back
 * to the upload screen while the imported rows stayed in the account
 * forever — a decorative undo, not a real one. `undoImportedTitles` is the
 * real removal path, scoped to the caller's own user_id (never another
 * account's rows) and to exactly the (tmdb_id, media_type) keys the import
 * actually wrote.
 */
function mockClient(userId: string | null) {
  const eqCalls: { col: string; val: unknown }[] = [];
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    delete: () => builder,
    eq: (col: unknown, val: unknown) => {
      eqCalls.push({ col: String(col), val });
      return builder;
    },
    then: (res: (v: unknown) => void) => Promise.resolve({ data: null, error: null, count: 1 }).then(res),
  });
  const client = {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from: () => builder,
  } as unknown as SupabaseClient;
  return { client, eqCalls };
}

describe('undoImportedTitles — a real removal, scoped to the caller\'s own rows', () => {
  it('requires a signed-in user rather than silently no-oping', async () => {
    vi.resetModules();
    const { client } = mockClient(null);
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => client }));
    const mod = await import('./import');
    const res = await mod.undoImportedTitles([{ tmdbId: 1, mediaType: 'movie' }]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/signed in/i);
  });

  it('is a no-op for an empty key list', async () => {
    vi.resetModules();
    const { client } = mockClient('user-1');
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => client }));
    const mod = await import('./import');
    const res = await mod.undoImportedTitles([]);
    expect(res).toEqual({ ok: true, removed: 0 });
  });

  it('deletes scoped to the caller\'s own user_id and each given (tmdb_id, media_type)', async () => {
    vi.resetModules();
    const { client, eqCalls } = mockClient('user-1');
    vi.doMock('@/lib/supabase/server', () => ({ createClient: () => client }));
    const mod = await import('./import');
    const res = await mod.undoImportedTitles([{ tmdbId: 603, mediaType: 'movie' }]);
    expect(res.ok).toBe(true);
    expect(res.removed).toBe(1);
    expect(eqCalls).toContainEqual({ col: 'user_id', val: 'user-1' });
    expect(eqCalls).toContainEqual({ col: 'tmdb_id', val: 603 });
    expect(eqCalls).toContainEqual({ col: 'media_type', val: 'movie' });
  });
});
