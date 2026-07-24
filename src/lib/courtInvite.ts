/**
 * Live Court invite — native iOS share sheet first. PURE + injectable so it's
 * unit-testable without a browser.
 *
 * The share() call is made SYNCHRONOUSLY inside the caller's tap (no awaited work
 * before it) so iOS Safari / installed PWA accept the user gesture and open the
 * native share sheet (Messages, Mail, WhatsApp, Copy, …). We never force Messages,
 * never window.open first, and never do fetch/auth/room-creation before share — the
 * invite URL is prepared BEFORE the tap and validated here.
 *
 * Fallback (share unsupported or throws a non-cancel error):
 *   clipboard writeText(message + URL) → toast; if clipboard fails → execCommand;
 *   if that fails → manual modal. AbortError = the user dismissed the sheet (no-op).
 * Every non-cancel outcome is visible: share sheet, copied toast, manual modal, or
 * an error toast — a tap NEVER silently does nothing.
 */

export type InviteButtonState = 'idle' | 'sharing';
export type InviteOutcome =
  | 'shared'
  | 'cancelled'
  | 'copied'
  | 'manual'
  | 'invalid-url'
  | 'ignored-duplicate';

export interface InviteNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

export const INVITE_TITLE = 'Join my WatchVERD1CT Court';
export const INVITE_TEXT = 'Help us decide what to watch tonight. Join my WatchVERD1CT Court:';

/** A well-formed, shareable Court room URL: absolute http(s) with a /court/<id> path.
 *  Rejects undefined / empty / relative / malformed URLs so we never share junk. */
export function isValidInviteUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.trim() === '') return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return /^\/court\/[^/]+/.test(u.pathname);
}

export function inviteShareData(url: string): ShareData {
  return { title: INVITE_TITLE, text: INVITE_TEXT, url };
}

/** The full copy/paste invitation: message + URL (one space, as iMessage renders it). */
export function inviteClipboardText(url: string): string {
  return `${INVITE_TEXT} ${url}`;
}

/** iOS Messages deep link carrying the invitation, URL-encoded (no raw spaces). */
export function smsHref(url: string): string {
  return `sms:&body=${encodeURIComponent(inviteClipboardText(url))}`;
}

function isCancel(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  return err.name === 'AbortError' || err.name === 'NotAllowedError' || /abort|cancel|dismiss/i.test(err.message ?? '');
}

export interface RunInviteOptions {
  url: string;
  navigator: InviteNavigator;
  /** Synchronous execCommand copy fallback; returns true on success. */
  execCopy: (text: string) => boolean;
  setButtonState: (s: InviteButtonState) => void;
  /** Toast: "Invite link copied — paste it into Messages." */
  onCopied: () => void;
  /** Open the manual invite modal (clipboard also failed). */
  onManual: () => void;
  /** Visible error toast (e.g. URL not ready). */
  onError: (message: string) => void;
  log?: (event: string, detail?: unknown) => void;
  /** Duplicate-tap guard (a ref shared with the component). */
  lock: { get: () => boolean; set: (v: boolean) => void };
}

export async function runInvite(o: RunInviteOptions): Promise<InviteOutcome> {
  const { navigator: nav, log } = o;
  if (o.lock.get()) { log?.('duplicate tap ignored'); return 'ignored-duplicate'; }
  // The URL is prepared before the tap; validate it (never share localhost-junk/undefined).
  if (!isValidInviteUrl(o.url)) {
    log?.('invalid invite url', o.url);
    o.onError('The invitation link is not ready yet. Try again in a moment.');
    return 'invalid-url';
  }
  const url = o.url;
  o.lock.set(true);
  log?.('invite tapped', url);
  try {
    if (typeof nav.share === 'function') {
      log?.('navigator.share supported — opening sheet');
      // SYNCHRONOUS invocation inside the gesture (promise created before any await).
      const shared = nav.share(inviteShareData(url));
      o.setButtonState('sharing');
      try {
        await shared;
        log?.('share success');
        return 'shared';
      } catch (e) {
        if (isCancel(e)) { log?.('share dismissed (AbortError)'); return 'cancelled'; }
        log?.('share failed (non-cancel) — falling back to clipboard', e);
      } finally {
        o.setButtonState('idle');
      }
    } else {
      log?.('navigator.share unsupported — clipboard fallback');
    }

    const text = inviteClipboardText(url);
    // Clipboard fallback → visible confirmation.
    try {
      if (typeof nav.clipboard?.writeText === 'function') {
        await nav.clipboard.writeText(text);
        log?.('clipboard copy success');
        o.onCopied();
        return 'copied';
      }
    } catch (e) {
      log?.('clipboard writeText failed', e);
    }
    if (o.execCopy(text)) {
      log?.('execCommand copy success');
      o.onCopied();
      return 'copied';
    }
    log?.('all copy methods failed — manual modal');
    o.onManual();
    return 'manual';
  } finally {
    o.lock.set(false);
  }
}

/** Copy text via the async Clipboard API, falling back to execCommand. */
export async function copyText(nav: InviteNavigator, text: string, execCopy: (t: string) => boolean): Promise<boolean> {
  try {
    if (typeof nav.clipboard?.writeText === 'function') { await nav.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  return execCopy(text);
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

/** Compact one-line display of a Court URL: "host/court/…" (code truncated). */
export function displayInviteUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}/court/…`;
  } catch {
    return url;
  }
}
