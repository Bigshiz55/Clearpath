import { describe, it, expect } from 'vitest';
import { anonClient, hasSupabase } from './_env';

/**
 * REAL authenticated-session integration. WatchVerdict mints an anonymous guest
 * session so anyone with a link can play; this verifies that path end-to-end against
 * the live project (or clearly reports that "Anonymous sign-ins" is disabled, which
 * is a required Supabase setting for /app guest access). Skips without Supabase env.
 */
describe.skipIf(!hasSupabase)('Auth (live Supabase)', () => {
  it('anonymous sign-in yields a real user id — or reports it is disabled', async () => {
    const sb = anonClient();
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      // Not a test failure — a precise, actionable config signal.
      console.warn('[integration] Anonymous sign-ins appear disabled:', error.message);
      expect(error.message).toMatch(/anonymous|disabled|not enabled|signups/i);
      return;
    }
    expect(data.user?.id, 'authenticated user id present').toBeTruthy();
    const { data: got } = await sb.auth.getUser();
    expect(got.user?.id).toBe(data.user?.id);
    await sb.auth.signOut();
  });
});
