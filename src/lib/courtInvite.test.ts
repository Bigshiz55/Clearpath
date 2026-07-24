import { describe, it, expect, vi } from 'vitest';
import {
  runInvite, inviteShareData, inviteMessage, fullInvitation, smsHref, copyText,
  INVITE_TITLE, type RunInviteOptions,
} from './courtInvite';

const URL = 'https://watchverdict.app/court/ABCD';
const ROOM = 'room ABCD';

function harness(over: Partial<RunInviteOptions> = {}) {
  let locked = false;
  const states: string[] = [];
  let fallbacks = 0;
  const base: RunInviteOptions = {
    url: URL,
    roomName: ROOM,
    navigator: {},
    setButtonState: (s) => states.push(s),
    onFallback: () => { fallbacks++; },
    lock: { get: () => locked, set: (v) => { locked = v; } },
    ...over,
  };
  return { opts: base, states, fallbacks: () => fallbacks, isLocked: () => locked };
}

describe('invitation content — iMessage-first copy', () => {
  it('weaves the room name into the friendly message when available', () => {
    expect(inviteMessage(ROOM)).toContain('WatchVerdict Live Court (room ABCD)');
    expect(inviteMessage(null)).toContain('Join me in WatchVerdict Live Court.');
    expect(inviteMessage(ROOM)).toContain('combine our taste and choose what we should watch tonight');
  });
  it('inviteShareData carries title + message + secure url', () => {
    const d = inviteShareData(URL, ROOM);
    expect(d.title).toBe(INVITE_TITLE);
    expect(d.url).toBe(URL);
    expect(d.text).toContain('room ABCD');
  });
  it('fullInvitation is the message followed by the URL on its own line', () => {
    const full = fullInvitation(URL, ROOM);
    expect(full).toContain(inviteMessage(ROOM));
    expect(full.endsWith(URL)).toBe(true);
    expect(full).toContain('\n\n');
  });
  it('smsHref is an iOS Messages deep link with the encoded body', () => {
    const href = smsHref(URL, ROOM);
    expect(href.startsWith('sms:&body=')).toBe(true);
    const body = decodeURIComponent(href.replace('sms:&body=', ''));
    expect(body).toBe(fullInvitation(URL, ROOM));
    expect(href).toContain(encodeURIComponent(URL));
    // Properly URL-encoded (no raw spaces or newlines in the href).
    expect(href).not.toMatch(/\s/);
  });
});

describe('runInvite — share sheet first, polished modal fallback', () => {
  it('opens the native share sheet with the correct payload on success', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share } });
    const out = await runInvite(h.opts);
    expect(out).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(inviteShareData(URL, ROOM));
    expect(h.fallbacks()).toBe(0);
    expect(h.states).toEqual(['sharing', 'idle']);
  });

  it('treats a user cancel as a no-op — no fallback modal', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const h = harness({ navigator: { share } });
    expect(await runInvite(h.opts)).toBe('cancelled');
    expect(h.fallbacks()).toBe(0);
  });

  it('opens the fallback modal when share is unsupported', async () => {
    const h = harness({ navigator: {} });
    expect(await runInvite(h.opts)).toBe('fallback-modal');
    expect(h.fallbacks()).toBe(1);
  });

  it('opens the fallback modal when share throws a non-cancel error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share exploded'));
    const h = harness({ navigator: { share } });
    expect(await runInvite(h.opts)).toBe('fallback-modal');
    expect(h.fallbacks()).toBe(1);
  });

  it('never opens two share sheets from rapid taps', async () => {
    let resolve!: () => void;
    const share = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const h = harness({ navigator: { share } });
    const first = runInvite(h.opts);
    expect(await runInvite(h.opts)).toBe('ignored-duplicate');
    expect(share).toHaveBeenCalledTimes(1);
    resolve();
    expect(await first).toBe('shared');
    expect(h.isLocked()).toBe(false);
  });
});

describe('copyText — clipboard with execCommand fallback', () => {
  it('uses the async clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const exec = vi.fn().mockReturnValue(true);
    expect(await copyText({ clipboard: { writeText } }, 'hello', exec)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(exec).not.toHaveBeenCalled();
  });
  it('falls back to execCommand when clipboard is unavailable/throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const exec = vi.fn().mockReturnValue(true);
    expect(await copyText({ clipboard: { writeText } }, 'hello', exec)).toBe(true);
    expect(exec).toHaveBeenCalledWith('hello');
  });
});
