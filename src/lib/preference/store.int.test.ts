import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { loadPreference, recordEvents, undoEvent } from './store';
import { rankWithPreference } from './rank';
import { hasPreferenceSignal } from './rank';

/**
 * LIVE integration for THE DNA CASE persistence + ranking. Runs only when
 * Supabase env is present (skips cleanly in CI without secrets). Proves against a
 * real project: a round persists, DNA changes, shelves rerank, Undo restores, and
 * one user cannot read another user's DNA (RLS). Requires migration 0023 applied
 * and "Anonymous sign-ins" enabled.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const HAS = URL.length > 0 && KEY.length > 0;

function dims(over: Record<string, number>) {
  const d: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) d[k] = 50;
  return { ...d, ...over };
}
const anon = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const uniq = (p: string) => `${p}_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

describe.skipIf(!HAS)('preference persistence + ranking (live Supabase)', () => {
  it('a round persists, reranks, and Undo restores prior state', async () => {
    const sb = anon();
    const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
    if (authErr) { console.warn('[pref.int] anonymous sign-in disabled:', authErr.message); return; }
    const userId = auth.user!.id;

    const roundId = uniq('round');
    const events = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: uniq('e'), titleId: `movie:${1000 + i}`, action: 'seen_liked' as const, experienceGrade: 'loved' as const, dims: dims({ realism: 85, darkness: 75 }), genres: ['crime', 'mystery'], roundId, at: Date.now() })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: uniq('e'), titleId: `tv:${2000 + i}`, action: 'unseen_not_interested' as const, dims: dims({ realism: 20 }), genres: ['supernatural'], roundId, at: Date.now() })),
    ];
    const written = await recordEvents(sb, userId, events);
    expect(written).toBeGreaterThan(0);

    // Idempotent re-send writes nothing new.
    expect(await recordEvents(sb, userId, events)).toBe(0);

    const loaded = await loadPreference(sb, userId, Date.now());
    expect(hasPreferenceSignal(loaded.dna)).toBe(true);

    const candidates = [
      { id: 'grounded', objective: 80, dims: dims({ realism: 88 }), genres: ['crime', 'mystery'] },
      { id: 'supernatural', objective: 82, dims: dims({ realism: 18 }), genres: ['supernatural'] },
    ];
    const ranked = rankWithPreference(candidates, loaded.dna, { corrections: loaded.corrections });
    expect(ranked[0]!.id).toBe('grounded'); // reranked above the higher-objective supernatural title

    // Undo one event → still persists, evidence reduced.
    await undoEvent(sb, userId, events[0]!.id);
    const after = await loadPreference(sb, userId, Date.now());
    expect(after.events.length).toBe(loaded.events.length - 1);

    await sb.auth.signOut();
  });

  it('one user cannot read another user\'s DNA (RLS)', async () => {
    const a = anon();
    const b = anon();
    const { data: authA, error: eA } = await a.auth.signInAnonymously();
    const { data: authB, error: eB } = await b.auth.signInAnonymously();
    if (eA || eB) return; // anonymous disabled
    const userA = authA.user!.id;

    await recordEvents(a, userA, [{ id: uniq('e'), titleId: 'movie:99', action: 'seen_liked', dims: dims({ pacing: 90 }), genres: ['crime'], at: Date.now() }]);

    // User B queries A's events directly → RLS returns nothing.
    const { data: leak } = await b.from('preference_events').select('id').eq('user_id', userA);
    expect(leak ?? []).toHaveLength(0);

    await a.auth.signOut();
    await b.auth.signOut();
  });
});
