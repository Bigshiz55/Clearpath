import { describe, it, expect, vi } from 'vitest';
import {
  runInvite, isValidInviteUrl, inviteShareData, inviteClipboardText, smsHref, displayInviteUrl, copyText,
  INVITE_TITLE, INVITE_TEXT, type RunInviteOptions,
} from './courtInvite';

const URL = 'https://clearpath-pearl-chi.vercel.app/court/ABCD';

function harness(over: Partial<RunInviteOptions> = {}) {
  let locked = false;
  const calls = { copied: 0, manual: 0, errors: [] as string[] };
  const states: string[] = [];
  const base: RunInviteOptions = {
    url: URL,
    navigator: {},
    execCopy: () => false,
    setButtonState: (s) => states.push(s),
    onCopied: () => { calls.copied++; },
    onManual: () => { calls.manual++; },
    onError: (m) => { calls.errors.push(m); },
    lock: { get: () => locked, set: (v) => { locked = v; } },
    ...over,
  };
  return { opts: base, calls, states, isLocked: () => locked };
}

describe('isValidInviteUrl', () => {
  it('accepts an absolute http(s) /court/<id> URL', () => {
    expect(isValidInviteUrl(URL)).toBe(true);
    expect(isValidInviteUrl('http://localhost:3000/court/XY')).toBe(true);
  });
  it('rejects undefined, empty, relative, malformed, and non-court URLs', () => {
    expect(isValidInviteUrl(undefined)).toBe(false);
    expect(isValidInviteUrl('')).toBe(false);
    expect(isValidInviteUrl('/court/ABCD')).toBe(false);
    expect(isValidInviteUrl('not a url')).toBe(false);
    expect(isValidInviteUrl('https://example.com/')).toBe(false);
    expect(isValidInviteUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('invite payloads', () => {
  it('share data uses the exact title/text + the room URL', () => {
    expect(inviteShareData(URL)).toEqual({ title: INVITE_TITLE, text: INVITE_TEXT, url: URL });
  });
  it('clipboard text is "message url"', () => {
    expect(inviteClipboardText(URL)).toBe(`${INVITE_TEXT} ${URL}`);
  });
  it('smsHref is an encoded sms deep link (no raw spaces)', () => {
    const href = smsHref(URL);
    expect(href.startsWith('sms:&body=')).toBe(true);
    expect(decodeURIComponent(href.replace('sms:&body=', ''))).toBe(inviteClipboardText(URL));
    expect(href).not.toMatch(/\s/);
  });
  it('displayInviteUrl is a compact host/court/… string', () => {
    expect(displayInviteUrl(URL)).toBe('clearpath-pearl-chi.vercel.app/court/…');
  });
});

describe('runInvite', () => {
  it('invokes navigator.share with the correct room URL on tap', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share } });
    expect(await runInvite(h.opts)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: INVITE_TITLE, text: INVITE_TEXT, url: URL });
    expect(h.calls.copied).toBe(0);
    expect(h.calls.errors).toEqual([]);
  });

  it('treats AbortError (dismiss) as a no-op — no copy, no error, no modal', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share, clipboard: { writeText } } });
    expect(await runInvite(h.opts)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
    expect(h.calls.copied).toBe(0);
    expect(h.calls.manual).toBe(0);
  });

  it('a non-AbortError falls back to clipboard + copied toast', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share failed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share, clipboard: { writeText } } });
    expect(await runInvite(h.opts)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(inviteClipboardText(URL));
    expect(h.calls.copied).toBe(1);
  });

  it('unsupported share → clipboard + copied toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { clipboard: { writeText } } });
    expect(await runInvite(h.opts)).toBe('copied');
    expect(h.calls.copied).toBe(1);
  });

  it('failed clipboard AND execCommand → manual modal', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCopy = vi.fn().mockReturnValue(false);
    const h = harness({ navigator: { clipboard: { writeText } }, execCopy });
    expect(await runInvite(h.opts)).toBe('manual');
    expect(h.calls.manual).toBe(1);
    expect(h.calls.copied).toBe(0);
  });

  it('an invalid/undefined room URL shows a visible error and never shares', async () => {
    const share = vi.fn();
    const h = harness({ url: '', navigator: { share } });
    expect(await runInvite(h.opts)).toBe('invalid-url');
    expect(share).not.toHaveBeenCalled();
    expect(h.calls.errors[0]).toMatch(/not ready/i);
  });

  it('ignores a duplicate tap while a share is in flight (one share call)', async () => {
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

describe('copyText', () => {
  it('uses async clipboard, else execCommand', async () => {
    const ok = await copyText({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }, 't', () => false);
    expect(ok).toBe(true);
    const viaExec = await copyText({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('x')) } }, 't', () => true);
    expect(viaExec).toBe(true);
  });
});
