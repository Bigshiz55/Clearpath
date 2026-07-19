'use client';

import { useEffect, useState } from 'react';

const KEY = 'wv_install_hint_dismissed';

/** The browser's install prompt event (not in the TS DOM lib by default). */
interface InstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * A friendly, dismissible "put this on your home screen" nudge — so testers
 * (especially seniors) get an app-like icon without an App Store. iOS Safari
 * never fires `beforeinstallprompt`, so it gets short Share-sheet instructions;
 * Android/desktop Chrome get a one-tap Install button. Hidden once installed
 * (standalone) or dismissed.
 */
export function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
    if (standalone) return;
    try {
      if (localStorage.getItem(KEY) === '1') return;
    } catch {
      /* ignore */
    }

    const ua = nav.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    if (isIos && isSafari) {
      setIos(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-400/40 bg-brand-500/[0.08] p-3 sm:p-4">
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-500/20 text-2xl" aria-hidden>
        📱
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">Keep WatchVrdikt one tap away</div>
        {ios ? (
          <div className="mt-0.5 text-xs text-slate-300">
            Tap the <span className="font-semibold text-white">Share</span> button
            <span aria-hidden> ⬆️ </span>
            at the bottom, then <span className="font-semibold text-white">“Add to Home Screen.”</span>
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-slate-300">Add it to your home screen — it opens full-screen, like an app.</div>
        )}
      </div>
      {!ios && deferred && (
        <button onClick={install} className="btn-primary flex-none px-4 py-2 text-sm">
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-none rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
