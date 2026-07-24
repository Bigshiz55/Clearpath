/**
 * Live Court invite — iMessage-first. PURE + injectable so it's unit-testable
 * without a real browser. Primary path is the native iOS share sheet
 * (`navigator.share`), invoked SYNCHRONOUSLY inside the user's tap (no awaited
 * network call, no setTimeout before it) so iOS Safari accepts the gesture and the
 * user can pick Messages and send over iMessage. We NEVER try to send an iMessage
 * silently (browsers can't) and NEVER build an in-app recipient picker.
 *
 * Flow:
 *   1. navigator.share({ title, text, url }) with a friendly invitation + the secure
 *      room URL → user selects Messages in the sheet.
 *      - user cancel (AbortError) → no error, no fallback.
 *   2. share unsupported or throws → open the polished fallback modal
 *      (Copy Invite Link · Open Messages [sms:] · Copy Full Invitation).
 * The Invite button never silently fails. A duplicate-tap lock prevents double sheets.
 */

export type InviteButtonState = 'idle' | 'sharing' | 'copied';
export type InviteOutcome = 'shared' | 'cancelled' | 'fallback-modal' | 'ignored-duplicate';

export interface InviteNavigator {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
}

/** The friendly invitation body (room name woven in when available). */
export const INVITE_TITLE = 'WatchVerdict Live Court';
const BASE_MESSAGE =
  'Join me in WatchVerdict Live Court. We’ll each pick our favorites, then WatchVerdict will combine our taste and choose what we should watch tonight.';

export function inviteMessage(roomName?: string | null): string {
  const name = roomName?.trim();
  return name
    ? `Join me in WatchVerdict Live Court (${name}). We’ll each pick our favorites, then WatchVerdict will combine our taste and choose what we should watch tonight.`
    : BASE_MESSAGE;
}

/** Share payload for navigator.share — message + secure room URL. */
export function inviteShareData(url: string, roomName?: string | null): ShareData {
  return { title: INVITE_TITLE, text: inviteMessage(roomName), url };
}

/** The full copy-paste invitation: message + URL on its own line. */
export function fullInvitation(url: string, roomName?: string | null): string {
  return `${inviteMessage(roomName)}\n\n${url}`;
}

/**
 * An iOS-compatible Messages deep link carrying the invitation body (message + URL),
 * URL-encoded. `sms:&body=` is the form iOS Safari honors; other platforms accept it
 * too. Opening it lets the user pick a recipient in Messages themselves.
 */
export function smsHref(url: string, roomName?: string | null): string {
  return `sms:&body=${encodeURIComponent(fullInvitation(url, roomName))}`;
}

/** A share rejection that means "the user dismissed the sheet" — not a failure. */
function isCancel(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  return err.name === 'AbortError' || err.name === 'NotAllowedError' || /abort|cancel|dismiss/i.test(err.message ?? '');
}

export interface RunInviteOptions {
  url: string;
  roomName?: string | null;
  navigator: InviteNavigator;
  setButtonState: (s: InviteButtonState) => void;
  /** Open the polished fallback modal (share unsupported / failed). Never silent. */
  onFallback: () => void;
  /** Dev-only structured logger (event, optional detail). */
  log?: (event: string, detail?: unknown) => void;
  /** Duplicate-tap guard shared with the component (a ref). */
  lock: { get: () => boolean; set: (v: boolean) => void };
}

export async function runInvite(o: RunInviteOptions): Promise<InviteOutcome> {
  const { url, roomName, navigator: nav, log } = o;
  if (o.lock.get()) { log?.('duplicate tap ignored'); return 'ignored-duplicate'; }
  if (!url) { log?.('no invite url — opening fallback'); o.onFallback(); return 'fallback-modal'; }
  o.lock.set(true);
  log?.('invite button clicked');
  log?.('generated invite URL', url);
  try {
    if (typeof nav.share === 'function') {
      log?.('navigator.share supported');
      // Invoke share() SYNCHRONOUSLY (promise created before any await) so iOS
      // accepts it as part of the user gesture and opens the share sheet.
      const shared = nav.share(inviteShareData(url, roomName));
      o.setButtonState('sharing');
      try {
        await shared;
        log?.('share success');
        o.setButtonState('idle');
        return 'shared';
      } catch (e) {
        if (isCancel(e)) { log?.('share cancelled'); o.setButtonState('idle'); return 'cancelled'; }
        log?.('share failed (non-cancel) — opening fallback modal', e);
      }
    } else {
      log?.('navigator.share unsupported — opening fallback modal');
    }
    o.onFallback();
    o.setButtonState('idle');
    return 'fallback-modal';
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
