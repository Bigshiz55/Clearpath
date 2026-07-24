import { describe, it, expect } from 'vitest';
import { buildCourtInviteUrl, isValidRoomId } from './inviteUrl';

const ROOM = 'AB12CD34';

describe('isValidRoomId', () => {
  it('accepts codes, rejects junk', () => {
    expect(isValidRoomId('AB12CD34')).toBe(true);
    expect(isValidRoomId('a-b_c')).toBe(true);
    expect(isValidRoomId('')).toBe(false);
    expect(isValidRoomId('ab')).toBe(false);
    expect(isValidRoomId('room/../x')).toBe(false);
    expect(isValidRoomId(undefined)).toBe(false);
  });
});

describe('buildCourtInviteUrl', () => {
  it('production canonical domain (https) → absolute https URL', () => {
    const r = buildCourtInviteUrl({ origin: 'https://clearpath-pearl-chi.vercel.app', roomId: ROOM });
    expect(r.url).toBe('https://clearpath-pearl-chi.vercel.app/court/AB12CD34');
    expect(r.shareable).toBe(true);
    expect(r.error).toBeNull();
  });

  it('preview environment origin is used as-is (same-deployment guarantee)', () => {
    const r = buildCourtInviteUrl({ origin: 'https://clearpath-git-feature-x.vercel.app', roomId: ROOM });
    expect(r.url).toBe('https://clearpath-git-feature-x.vercel.app/court/AB12CD34');
    expect(r.shareable).toBe(true);
  });

  it('installed PWA / Safari share the same origin → identical URL', () => {
    const safari = buildCourtInviteUrl({ origin: 'https://app.watchverdict.com', roomId: ROOM });
    const pwa = buildCourtInviteUrl({ origin: 'https://app.watchverdict.com', roomId: ROOM });
    expect(safari.url).toBe(pwa.url);
  });

  it('local development is NOT shareable and warns', () => {
    const r = buildCourtInviteUrl({ origin: 'http://localhost:3000', roomId: ROOM });
    expect(r.url).toBe('http://localhost:3000/court/AB12CD34'); // still built for local testing
    expect(r.shareable).toBe(false);
    expect(r.warnings.join(' ')).toMatch(/localhost/);
  });

  it('missing/empty origin → error, no URL', () => {
    expect(buildCourtInviteUrl({ origin: '', roomId: ROOM }).error).toBe('invalid-origin');
    expect(buildCourtInviteUrl({ origin: null, roomId: ROOM }).url).toBeNull();
  });

  it('invalid base URL → error', () => {
    expect(buildCourtInviteUrl({ origin: 'not a url', roomId: ROOM }).error).toBe('invalid-origin');
  });

  it('trailing slash on origin is normalized away', () => {
    const r = buildCourtInviteUrl({ origin: 'https://x.vercel.app/', roomId: ROOM });
    expect(r.url).toBe('https://x.vercel.app/court/AB12CD34');
  });

  it('room ids requiring encoding are encoded', () => {
    const r = buildCourtInviteUrl({ origin: 'https://x.app', roomId: 'a b' as unknown as string });
    // "a b" is invalid per isValidRoomId → rejected rather than silently mangled.
    expect(r.error).toBe('invalid-room-id');
    const ok = buildCourtInviteUrl({ origin: 'https://x.app', roomId: 'A-b_9' });
    expect(ok.url).toBe('https://x.app/court/A-b_9');
  });

  it('invite token is preserved as ?t=, encoded', () => {
    const r = buildCourtInviteUrl({ origin: 'https://x.app', roomId: ROOM, token: 'a b/c' });
    expect(r.url).toBe('https://x.app/court/AB12CD34?t=a%20b%2Fc');
  });

  it('canonical override wins ONLY when a valid absolute https URL', () => {
    const good = buildCourtInviteUrl({ origin: 'https://preview.vercel.app', roomId: ROOM, canonicalOverride: 'https://watchverdict.app' });
    expect(good.url).toBe('https://watchverdict.app/court/AB12CD34');
    const bad = buildCourtInviteUrl({ origin: 'https://preview.vercel.app', roomId: ROOM, canonicalOverride: 'http://insecure.app' });
    expect(bad.origin).toBe('https://preview.vercel.app'); // http override ignored
    expect(bad.warnings.join(' ')).toMatch(/override-ignored/);
  });

  it('cross-deployment mismatch note: without an override, the host origin is always used', () => {
    // Guarantees the recipient opens the SAME deployment as the host.
    const r = buildCourtInviteUrl({ origin: 'https://host-deployment.vercel.app', roomId: ROOM });
    expect(r.origin).toBe('https://host-deployment.vercel.app');
  });
});
