import { describe, it, expect, beforeAll } from 'vitest';
import { anonClient, hasSupabase, uniq } from './_env';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * REAL Supabase / Live Court integration (anon publishable key — the same access a
 * guest browser has). Exercises the full room lifecycle, idempotent join (no ghost
 * participants), pick persistence, distinct error contract, and close. Requires the
 * Court migrations (0004 + 0014 + 0023) applied on the target project. Skips when
 * Supabase env is absent.
 */
describe.skipIf(!hasSupabase)('Live Court (live Supabase)', () => {
  // Lazily constructed inside beforeAll — createClient('','') throws, and the
  // describe body still evaluates at collection time even when skipIf will skip.
  let sb: SupabaseClient;

  beforeAll(async () => {
    sb = anonClient();
    // Fail fast + clearly if the schema isn't there.
    const { data, error } = await sb.rpc('court_health');
    expect(error, `court_health error: ${error?.message}`).toBeNull();
    expect((data as { ok?: boolean } | null)?.ok, 'court schema present').toBe(true);
  });

  it('health probe reports guest_id + expiry support (0023 applied)', async () => {
    const { data } = await sb.rpc('court_health');
    const h = data as Record<string, boolean>;
    expect(h.has_guest_id, 'run migration 0023').toBe(true);
    expect(h.has_expires_at, 'run migration 0023').toBe(true);
  });

  it('create → join (guest) → state, with idempotent re-join (no ghost participant)', async () => {
    const { data: created, error: e1 } = await sb.rpc('court_create', { p_media_type: 'any' });
    expect(e1).toBeNull();
    const room = Array.isArray(created) ? created[0] : created;
    const code = room.code as string;
    const hostToken = room.host_token as string;
    expect(code).toMatch(/^[a-z0-9]{6,}$/i);

    const guest = uniq('guest');
    const first = await sb.rpc('court_join', { p_code: code, p_name: 'Scott', p_love: [], p_avoid: [], p_mood: 'any', p_guest_id: guest });
    expect(first.error).toBeNull();
    const pid1 = (Array.isArray(first.data) ? first.data[0] : first.data).participant_id as string;

    // Re-join with the SAME device id → same seat, no duplicate.
    const again = await sb.rpc('court_join', { p_code: code, p_name: 'Scott', p_love: [], p_avoid: [], p_mood: 'any', p_guest_id: guest });
    const pid2 = (Array.isArray(again.data) ? again.data[0] : again.data).participant_id as string;
    expect(pid2, 'idempotent join returns the same participant').toBe(pid1);

    // A second, different device joins → 2 participants visible in authoritative state.
    await sb.rpc('court_join', { p_code: code, p_name: 'Amy', p_love: [], p_avoid: [], p_mood: 'funny', p_guest_id: uniq('guest') });
    const { data: st } = await sb.rpc('court_state', { p_code: code });
    const state = st as { status: string; participants: Array<{ name: string; pickCount: number }> };
    expect(state.status).toBe('lobby');
    expect(state.participants.length, 'exactly two seats (no ghost)').toBe(2);

    // Pick persistence (DB round-trip): set picks → read back via pickCount.
    const picks = [{ id: 603, mediaType: 'movie', title: 'The Matrix', year: 1999, posterPath: null }];
    const setp = await sb.rpc('court_set_picks', { p_code: code, p_participant: pid1, p_picks: picks });
    expect(setp.error).toBeNull();
    const { data: st2 } = await sb.rpc('court_state', { p_code: code });
    const scott = (st2 as typeof state).participants.find((p) => p.name === 'Scott');
    expect(scott?.pickCount, 'picks persisted and read back').toBe(1);

    // Host closes → subsequent joins are rejected with the precise error.
    const closed = await sb.rpc('court_close', { p_code: code, p_host_token: hostToken });
    expect(closed.error).toBeNull();
    const afterClose = await sb.rpc('court_join', { p_code: code, p_name: 'Late', p_love: [], p_avoid: [], p_mood: 'any', p_guest_id: uniq('g') });
    expect(afterClose.error?.message ?? '').toMatch(/ROOM_CLOSED/);
  });

  it('joining a non-existent room returns ROOM_NOT_FOUND', async () => {
    const r = await sb.rpc('court_join', { p_code: 'zzzznotarealroom', p_name: 'X', p_love: [], p_avoid: [], p_mood: 'any', p_guest_id: uniq('g') });
    expect(r.error?.message ?? '').toMatch(/ROOM_NOT_FOUND/);
  });

  it('court_state for an unknown room returns null (→ not-found in the UI)', async () => {
    const { data } = await sb.rpc('court_state', { p_code: 'zzzznotarealroom' });
    expect(data).toBeNull();
  });
});
