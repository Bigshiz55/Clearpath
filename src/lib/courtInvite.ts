/**
 * Court "Send invite" behavior — PURE and injectable so it can be unit-tested
 * without a real browser. The component wires real `navigator`/DOM in; tests pass
 * fakes. iOS-safe: `navigator.share` is invoked SYNCHRONOUSLY inside the caller's
 * tap (no awaited network call, no setTimeout before it).
 *
 * Flow (exactly as specified):
 *   1. If navigator.share exists → call it with the fixed title/text/url and await.
 *      - user cancel (AbortError) → NO error, NO fallback.
 *      - non-cancel throw / unsupported → clipboard.
 *   2. navigator.clipboard.writeText → toast "Invite link copied".
 *   3. clipboard unavailable/fails → execCommand textarea fallback → toast.
 *   4. everything fails → open the manual modal.
 * A duplicate-tap lock prevents concurrent shares.
 */

export type InviteButtonState = 'idle' | 'sharing' | 'copied';
export type InviteOutcome =
  | 'shared'
  | 'cancelled'
  | 'copied-clipboard'
  | 'copied-exec'
  | 'manual'
  | 'ignored-duplicate';

export interface InviteNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

export interface RunInviteOptions {
  url: string;
  navigator: InviteNavigator;
  /** Synchronous execCommand-based copy fallback; returns true on success. */
  execCopy: (text: string) => boolean;
  setButtonState: (s: InviteButtonState) => void;
  /** Show the "Invite link copied" toast + flash the copied button label. */
  onCopied: () => void;
  /** Open the centered manual-copy modal (last resort). */
  onManual: () => void;
  /** Dev-only structured logger (event, optional detail). */
  log?: (event: string, detail?: unknown) => void;
  /** Duplicate-tap guard shared with the component (a ref). */
  lock: { get: () => boolean; set: (v: boolean) => void };
}

export const INVITE_SHARE_TITLE = 'Join my WatchVerdict Court';
export const INVITE_SHARE_TEXT = 'Join my WatchVerdict Court and help decide what we should watch.';

export function inviteShareData(url: string): ShareData {
  return { title: INVITE_SHARE_TITLE, text: INVITE_SHARE_TEXT, url };
}

/** A share rejection that means "the user dismissed the sheet" — not a failure. */
function isCancel(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  return err.name === 'AbortError' || err.name === 'NotAllowedError' || /abort|cancel|dismiss/i.test(err.message ?? '');
}

export async function runInvite(o: RunInviteOptions): Promise<InviteOutcome> {
  const { url, navigator: nav, log } = o;
  if (o.lock.get()) { log?.('duplicate tap ignored'); return 'ignored-duplicate'; }
  if (!url) { log?.('no invite url'); return 'ignored-duplicate'; }
  o.lock.set(true);
  log?.('invite button clicked');
  log?.('generated invite URL', url);
  try {
    if (typeof nav.share === 'function') {
      log?.('navigator.share supported');
      // Invoke share() SYNCHRONOUSLY (the promise is created before any await),
      // so iOS Safari accepts it as part of the user gesture.
      const shared = nav.share(inviteShareData(url));
      o.setButtonState('sharing');
      try {
        await shared;
        log?.('share success');
        o.setButtonState('idle');
        return 'shared';
      } catch (e) {
        if (isCancel(e)) { log?.('share cancelled'); o.setButtonState('idle'); return 'cancelled'; }
        log?.('share failed (non-cancel) — falling back to clipboard', e);
        o.setButtonState('idle');
      }
    } else {
      log?.('navigator.share unsupported');
    }

    // Clipboard fallback.
    if (typeof nav.clipboard?.writeText === 'function') {
      try {
        await nav.clipboard.writeText(url);
        log?.('clipboard fallback success');
        o.onCopied();
        return 'copied-clipboard';
      } catch (e) {
        log?.('clipboard writeText failed', e);
      }
    } else {
      log?.('navigator.clipboard unavailable');
    }

    // execCommand textarea fallback.
    if (o.execCopy(url)) {
      log?.('execCommand copy success');
      o.onCopied();
      return 'copied-exec';
    }

    // Everything failed → manual modal.
    log?.('all invite methods failed — opening manual modal');
    o.onManual();
    o.setButtonState('idle');
    return 'manual';
  } finally {
    o.lock.set(false);
  }
}

/** Safe execCommand('copy') via an off-screen textarea. Returns true on success. */
export function copyViaExecCommand(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
