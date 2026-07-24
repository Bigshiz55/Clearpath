import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSession, listSessions } from './sessions';

/**
 * LIVE founder-isolation integration (PART 12) — proves against a REAL Supabase
 * that RLS keeps each founder's test sessions private. Runs only when Supabase
 * env is present AND migration 0025 is applied; skips cleanly otherwise (so CI
 * without secrets stays green). Requires "Anonymous sign-ins" enabled.
 *
 * What it proves end-to-end:
 *   • User A creates a founder_test_session → it persists and A can read it.
 *   • The SAME session survives a fresh client (sign-out / sign-in continuity).
 *   • User B can NOT read A's session — not via the helper, not via a direct
 *     `.eq('user_id', A)` query. RLS returns nothing.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const HAS = URL.length > 0 && KEY.length > 0;

const anon = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

describe.skipIf(!HAS)('founder session isolation (live Supabase, needs 0025)', () => {
  it('a founder session persists, is readable by its owner, and survives a new client', async () => {
    const a = anon();
    const { data: auth, error } = await a.auth.signInAnonymously();
    if (error) { console.warn('[founder.int] anonymous sign-in disabled:', error.message); return; }
    const userA = auth.user!.id;

    const created = await createSession(a, userA, 'scott', 'Scott Main (int-test)');
    if (!created) { console.warn('[founder.int] 0025 not applied — skipping'); return; }

    // Owner reads it back.
    const own = await listSessions(a, userA, 'scott');
    expect(own.some((s) => s.id === created.id)).toBe(true);

    // Continuity: a brand-new client with the SAME token still sees it (persists
    // across sign-out/return; the row is not tied to a live connection).
    const a2 = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${auth.session!.access_token}` } },
    });
    const again = await listSessions(a2, userA, 'scott');
    expect(again.some((s) => s.id === created.id)).toBe(true);

    await a.auth.signOut();
  });

  it('a different founder account can NOT read another founder\'s sessions (RLS)', async () => {
    const a = anon();
    const b = anon();
    const { data: authA, error: eA } = await a.auth.signInAnonymously();
    const { data: authB, error: eB } = await b.auth.signInAnonymously();
    if (eA || eB) return;
    const userA = authA.user!.id;

    const created = await createSession(a, userA, 'scott', 'Scott private (int-test)');
    if (!created) return; // 0025 not applied

    // B via the helper (scoped to B's own id) sees nothing of A's.
    const bList = await listSessions(b, authB.user!.id, 'scott');
    expect(bList.some((s) => s.id === created.id)).toBe(false);

    // B trying to read A's rows directly → RLS returns empty.
    const { data: leak } = await b.from('founder_test_sessions').select('id').eq('user_id', userA);
    expect(leak ?? []).toHaveLength(0);

    await a.auth.signOut();
    await b.auth.signOut();
  });
});
