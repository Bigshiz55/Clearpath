import { describe, it, expect, vi } from 'vitest';
import { runInvite, inviteShareData, INVITE_SHARE_TITLE, INVITE_SHARE_TEXT, type RunInviteOptions } from './courtInvite';

const URL = 'https://watchverdict.app/court/ABCD';

function harness(over: Partial<RunInviteOptions> = {}) {
  let locked = false;
  const states: string[] = [];
  const calls = { copied: 0, manual: 0 };
  const base: RunInviteOptions = {
    url: URL,
    navigator: {},
    execCopy: () => false,
    setButtonState: (s) => states.push(s),
    onCopied: () => { calls.copied++; },
    onManual: () => { calls.manual++; },
    lock: { get: () => locked, set: (v) => { locked = v; } },
    ...over,
  };
  return { opts: base, states, calls, isLocked: () => locked };
}

describe('runInvite', () => {
  it('shares the correct court URL with the fixed title/text when share succeeds', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share } });
    const out = await runInvite(h.opts);
    expect(out).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url: URL });
    expect(h.calls.copied).toBe(0);
    expect(h.calls.manual).toBe(0);
    expect(h.states).toEqual(['sharing', 'idle']);
  });

  it('treats a user cancel (AbortError) as a no-op — no clipboard, no error, no toast', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share, clipboard: { writeText } } });
    const out = await runInvite(h.opts);
    expect(out).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
    expect(h.calls.copied).toBe(0);
    expect(h.calls.manual).toBe(0);
  });

  it('falls back to clipboard when navigator.share is unsupported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { clipboard: { writeText } } });
    const out = await runInvite(h.opts);
    expect(out).toBe('copied-clipboard');
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(h.calls.copied).toBe(1);
  });

  it('falls back to clipboard when share throws a NON-cancel error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('share failed for real'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const h = harness({ navigator: { share, clipboard: { writeText } } });
    const out = await runInvite(h.opts);
    expect(out).toBe('copied-clipboard');
    expect(writeText).toHaveBeenCalledWith(URL);
    expect(h.calls.copied).toBe(1);
  });

  it('uses the execCommand fallback when clipboard is unavailable', async () => {
    const execCopy = vi.fn().mockReturnValue(true);
    const h = harness({ navigator: {}, execCopy });
    const out = await runInvite(h.opts);
    expect(out).toBe('copied-exec');
    expect(execCopy).toHaveBeenCalledWith(URL);
    expect(h.calls.copied).toBe(1);
  });

  it('opens the manual modal when clipboard AND execCommand both fail', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const execCopy = vi.fn().mockReturnValue(false);
    const h = harness({ navigator: { clipboard: { writeText } }, execCopy });
    const out = await runInvite(h.opts);
    expect(out).toBe('manual');
    expect(h.calls.manual).toBe(1);
    expect(h.calls.copied).toBe(0);
  });

  it('ignores a duplicate tap while a share is already in flight (only ONE share call)', async () => {
    let resolve!: () => void;
    const share = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const h = harness({ navigator: { share } });
    const first = runInvite(h.opts);       // locks, share() called once, awaits
    const second = await runInvite(h.opts); // synchronous re-entry → ignored
    expect(second).toBe('ignored-duplicate');
    expect(share).toHaveBeenCalledTimes(1);
    resolve();
    expect(await first).toBe('shared');
    // Lock released after completion → a later tap works again.
    expect(h.isLocked()).toBe(false);
  });

  it('does nothing when the url is empty', async () => {
    const share = vi.fn();
    const h = harness({ url: '', navigator: { share } });
    const out = await runInvite(h.opts);
    expect(out).toBe('ignored-duplicate');
    expect(share).not.toHaveBeenCalled();
  });

  it('inviteShareData carries the exact required copy', () => {
    expect(inviteShareData(URL)).toEqual({
      title: 'Join my WatchVerdict Court',
      text: 'Join my WatchVerdict Court and help decide what we should watch.',
      url: URL,
    });
  });
});
