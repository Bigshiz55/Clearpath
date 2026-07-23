'use client';

import { useRef, useState } from 'react';
import { runInvite, copyViaExecCommand, type InviteNavigator } from '@/lib/courtInvite';

const DEV = process.env.NODE_ENV !== 'production';

/**
 * The Court waiting-room "Invite the others" panel: a reliable Send-invite button
 * (native share → clipboard → execCommand → manual modal), the QR toggle, and the
 * invite URL. Layout is mobile-safe: the QR is responsively sized and fully inside
 * its card, and the URL sits BELOW it (never floating over the image). `navigator`
 * and the execCommand copy are injectable so the flow is testable.
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
  /** Test/harness hook — defaults to the real `navigator`. */
  getNavigator?: () => InviteNavigator;
  /** Test/harness hook — defaults to the real execCommand copy. */
  execCopy?: (text: string) => boolean;
}) {
  const [btn, setBtn] = useState<'idle' | 'sharing' | 'copied'>('idle');
  const [toast, setToast] = useState(false);
  const [manual, setManual] = useState(false);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const label = btn === 'sharing' ? 'Opening share…' : btn === 'copied' ? '✅ Link copied' : '✉️ Send invite';

  function showCopied() {
    setBtn('copied');
    setToast(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setBtn('idle'); setToast(false); }, 2000);
  }

  function nav(): InviteNavigator {
    if (getNavigator) return getNavigator();
    return typeof navigator !== 'undefined' ? (navigator as InviteNavigator) : {};
  }

  async function onInvite() {
    await runInvite({
      url,
      navigator: nav(),
      execCopy: execCopy ?? copyViaExecCommand,
      setButtonState: setBtn,
      onCopied: showCopied,
      onManual: () => setManual(true),
      log: DEV ? (e, d) => console.log('[court-invite]', e, d ?? '') : undefined,
      lock: { get: () => lock.current, set: (v) => { lock.current = v; } },
    });
  }

  async function copyManual() {
    const n = nav();
    let ok = false;
    try {
      if (typeof n.clipboard?.writeText === 'function') { await n.clipboard.writeText(url); ok = true; }
    } catch { /* fall through */ }
    if (!ok) ok = (execCopy ?? copyViaExecCommand)(url);
    if (ok) { setManual(false); showCopied(); }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold text-slate-300">Invite the others</div>

      {/* Buttons: one row when there's room, wrapping (stacking) on narrow phones.
          `relative z-10` + explicit pointer-events keep them tappable above any
          decorative layer; Send invite is only disabled while a share is opening. */}
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

      {/* QR: responsive width min(72vw, 280px), height auto, fully inside the card.
          The injected SVG is forced to fill the box so it can't overflow. */}
      {qr && (
        <div
          data-testid="court-qr"
          className="mx-auto mt-3 w-[min(72vw,280px)] max-w-full rounded-lg bg-white p-2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      )}

      {/* URL BELOW the QR, wrapping cleanly — never floating over the image. */}
      <p data-testid="court-invite-url" className="mt-3 break-words text-center text-[11px] text-slate-400">{url}</p>

      {toast && (
        <div role="status" data-testid="court-invite-toast" className="mt-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-center text-xs font-semibold text-emerald-100">
          Invite link copied
        </div>
      )}

      {manual && (
        <div
          data-testid="court-invite-modal"
          className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4"
          onClick={() => setManual(false)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 text-center shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-bold text-white">Copy your invite link</div>
            <p className="mt-3 break-words rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-slate-200">{url}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" data-testid="court-manual-copy" onClick={copyManual} className="btn-primary text-sm">Copy link</button>
              <button type="button" data-testid="court-manual-close" onClick={() => setManual(false)} className="btn-secondary text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
