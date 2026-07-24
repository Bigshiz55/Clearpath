'use client';

import { useRef, useState } from 'react';
import {
  runInvite, copyViaExecCommand, copyText, smsHref, inviteClipboardText, displayInviteUrl,
  type InviteNavigator,
} from '@/lib/courtInvite';

const DEV = process.env.NODE_ENV !== 'production';

/**
 * Live Court "Send invite" — opens the native iOS share sheet (Messages, Mail,
 * WhatsApp, Copy…) directly from the tap. Robust fallback: clipboard → toast →
 * manual modal (with Open Messages sms: link). The Send button is a real
 * <button type="button">, full-width, ≥52px, touch-action:manipulation, with a
 * pressed state and a TIME-BOUNDED double-tap guard so a hung share promise can
 * never leave it permanently disabled.
 */
export function CourtInviteBox({
  url,
  qr,
  onToggleQr,
  getNavigator,
  execCopy,
}: {
  url: string;
  qr: string | null;
  onToggleQr: () => void;
  getNavigator?: () => InviteNavigator;
  execCopy?: (text: string) => boolean;
}) {
  const [state, setState] = useState<'idle' | 'sharing'>('idle');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [manual, setManual] = useState(false);
  const lock = useRef(false);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, kind: 'ok' | 'err' = 'ok') {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function nav(): InviteNavigator {
    if (getNavigator) return getNavigator();
    return typeof navigator !== 'undefined' ? (navigator as InviteNavigator) : {};
  }
  const copier = () => execCopy ?? copyViaExecCommand;

  function releaseLock() {
    lock.current = false;
    setState('idle');
    if (safety.current) { clearTimeout(safety.current); safety.current = null; }
  }

  async function onInvite() {
    if (lock.current) return; // dedupe — the button is never `disabled`, so it always looks tappable
    // NOTE: runInvite owns the lock (it sets it true after its own guard); we must
    // NOT set it here or runInvite would see it already-held and bail as a duplicate.
    // Safety: if navigator.share() hangs (a known iOS/PWA quirk), auto-release so
    // the button can never get stuck.
    if (safety.current) clearTimeout(safety.current);
    safety.current = setTimeout(releaseLock, 1500);
    await runInvite({
      url,
      navigator: nav(),
      execCopy: copier(),
      setButtonState: setState,
      onCopied: () => showToast('Invite link copied — paste it into Messages.'),
      onManual: () => setManual(true),
      onError: (m) => showToast(m, 'err'),
      log: DEV ? (e, d) => console.log('[court-invite]', e, d ?? '') : undefined,
      lock: { get: () => lock.current, set: (v) => { lock.current = v; } },
    });
    releaseLock();
  }

  async function copyUrl() {
    if (await copyText(nav(), url, copier())) showToast('Invite link copied — paste it into Messages.');
    else showToast('Couldn’t copy — long-press the link to copy it.', 'err');
  }
  async function copyFull() {
    if (await copyText(nav(), inviteClipboardText(url), copier())) showToast('Invitation copied.');
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold text-slate-300">Invite the others</div>
      <p className="mt-0.5 text-[11px] text-slate-400">Opens your share sheet — pick Messages, Mail, or Copy.</p>

      {/* Buttons: Send invite is the full-width primary; QR is secondary. Stacked on
          phones (≥12px gap), side-by-side from 420px up. `relative z-10` keeps them
          above any decorative layer. */}
      <div className="relative z-10 mt-3 flex flex-col gap-3 min-[420px]:flex-row">
        <button
          type="button"
          data-testid="court-send-invite"
          onClick={onInvite}
          style={{ pointerEvents: 'auto', touchAction: 'manipulation', minHeight: 52 }}
          className="btn-primary w-full flex-1 text-base font-bold transition active:scale-[0.98] min-[420px]:flex-[2]"
        >
          {state === 'sharing' ? 'Opening share…' : '📨 Send invite'}
        </button>
        <button
          type="button"
          data-testid="court-toggle-qr"
          onClick={onToggleQr}
          style={{ touchAction: 'manipulation', minHeight: 52 }}
          className="btn-secondary w-full text-sm active:scale-[0.98] min-[420px]:w-auto"
        >
          {qr ? 'Hide QR' : 'QR code'}
        </button>
      </div>

      {qr && (
        <div
          data-testid="court-qr"
          className="mx-auto mt-3 w-[min(72vw,280px)] max-w-full rounded-lg bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}

      {/* Compact URL row: link icon + truncated URL (one line) + a separate Copy
          control. Never overlaps the buttons or escapes the card. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
        <span aria-hidden className="shrink-0 text-slate-400">🔗</span>
        <span data-testid="court-invite-url" className="min-w-0 flex-1 truncate text-[11px] text-slate-300" title={url}>
          {displayInviteUrl(url)}
        </span>
        <button
          type="button"
          data-testid="court-copy-url"
          onClick={copyUrl}
          style={{ touchAction: 'manipulation' }}
          className="shrink-0 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-100 active:scale-95"
        >
          Copy
        </button>
      </div>

      {toast && (
        <div
          role="status"
          data-testid={toast.kind === 'err' ? 'court-invite-error' : 'court-invite-toast'}
          className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-semibold ${toast.kind === 'err' ? 'bg-red-500/20 text-red-100' : 'bg-emerald-500/20 text-emerald-100'}`}
        >
          {toast.msg}
        </div>
      )}

      {manual && (
        <div
          data-testid="court-invite-modal"
          className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4"
          onClick={() => setManual(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 text-center shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-white">Invite to Live Court</div>
            <p className="mt-2 break-words rounded-lg border border-white/10 bg-white/5 p-2 text-left text-[11px] text-slate-200">{inviteClipboardText(url)}</p>
            <div className="mt-4 grid gap-2">
              <a
                data-testid="court-open-messages"
                href={smsHref(url)}
                onClick={() => showToast('Opening Messages…')}
                style={{ minHeight: 52 }}
                className="btn-primary flex w-full items-center justify-center text-sm"
              >
                💬 Open Messages
              </a>
              <button type="button" data-testid="court-copy-full" onClick={copyFull} style={{ minHeight: 44 }} className="btn-secondary w-full text-sm">Copy invitation</button>
              <button type="button" data-testid="court-manual-close" onClick={() => setManual(false)} style={{ minHeight: 44 }} className="btn-ghost w-full text-sm">Close</button>
            </div>
            {toast && <div role="status" data-testid="court-modal-toast" className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100">{toast.msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
