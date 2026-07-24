'use client';

import { useRef, useState } from 'react';
import { runInvite, copyViaExecCommand, copyText, smsHref, fullInvitation, type InviteNavigator } from '@/lib/courtInvite';

const DEV = process.env.NODE_ENV !== 'production';

/**
 * Live Court "Invite the others" panel — iMessage-first. Tapping Invite opens the
 * native iOS share sheet (pick Messages → send over iMessage). If sharing is
 * unavailable/fails, a polished modal offers Copy Invite Link, Open Messages
 * (sms: deep link), and Copy Full Invitation — each with a clear copied confirmation.
 * The button never silently fails. `navigator`/execCommand are injectable for tests.
 */
export function CourtInviteBox({
  url,
  roomName = null,
  qr,
  onToggleQr,
  getNavigator,
  execCopy,
}: {
  url: string;
  roomName?: string | null;
  qr: string | null;
  onToggleQr: () => void;
  getNavigator?: () => InviteNavigator;
  execCopy?: (text: string) => boolean;
}) {
  const [btn, setBtn] = useState<'idle' | 'sharing' | 'copied'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = btn === 'sharing' ? 'Opening Messages…' : btn === 'copied' ? '✅ Copied' : '💬 Invite';

  function confirm(msg: string) {
    setBtn('copied');
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setBtn('idle'); setToast(null); }, 2200);
  }

  function nav(): InviteNavigator {
    if (getNavigator) return getNavigator();
    return typeof navigator !== 'undefined' ? (navigator as InviteNavigator) : {};
  }
  const copier = () => execCopy ?? copyViaExecCommand;

  async function onInvite() {
    await runInvite({
      url,
      roomName,
      navigator: nav(),
      setButtonState: setBtn,
      onFallback: () => setManual(true),
      log: DEV ? (e, d) => console.log('[court-invite]', e, d ?? '') : undefined,
      lock: { get: () => lock.current, set: (v) => { lock.current = v; } },
    });
  }

  async function copyLink() {
    if (await copyText(nav(), url, copier())) confirm('Invite link copied');
  }
  async function copyFull() {
    if (await copyText(nav(), fullInvitation(url, roomName), copier())) confirm('Invitation copied');
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold text-slate-300">Invite the others</div>
      <p className="mt-0.5 text-[11px] text-slate-400">Tap Invite, then choose Messages to send it over iMessage.</p>

      {/* Buttons: one row when there's room, wrapping on narrow phones. `relative
          z-10` + explicit pointer-events keep them tappable; Invite is only disabled
          while the sheet is opening. */}
      <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          data-testid="court-send-invite"
          onClick={onInvite}
          disabled={btn === 'sharing'}
          style={{ pointerEvents: 'auto' }}
          className="btn-primary text-sm disabled:opacity-70"
        >
          {label}
        </button>
        <button type="button" data-testid="court-toggle-qr" onClick={onToggleQr} className="btn-secondary text-sm">
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

      <p data-testid="court-invite-url" className="mt-3 break-words text-center text-[11px] text-slate-400">{url}</p>

      {toast && (
        <div role="status" data-testid="court-invite-toast" className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-center text-xs font-semibold text-emerald-100">
          {toast}
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
            <p className="mt-2 break-words rounded-lg border border-white/10 bg-white/5 p-2 text-left text-[11px] text-slate-200">{fullInvitation(url, roomName)}</p>
            <div className="mt-4 grid gap-2">
              <a
                data-testid="court-open-messages"
                href={smsHref(url, roomName)}
                onClick={() => confirm('Opening Messages…')}
                className="btn-primary w-full text-sm"
              >
                💬 Open Messages
              </a>
              <button type="button" data-testid="court-manual-copy" onClick={copyLink} className="btn-secondary w-full text-sm">Copy invite link</button>
              <button type="button" data-testid="court-copy-full" onClick={copyFull} className="btn-secondary w-full text-sm">Copy full invitation</button>
              <button type="button" data-testid="court-manual-close" onClick={() => setManual(false)} className="btn-ghost w-full text-sm">Close</button>
            </div>
            {toast && <div role="status" data-testid="court-modal-toast" className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100">{toast}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
