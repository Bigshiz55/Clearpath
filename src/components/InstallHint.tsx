'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/I18nProvider';

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
  const t = useT();
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
        <div className="text-sm font-bold text-white">{t('misc.install.headline')}</div>
        {ios ? (
          <div className="mt-0.5 text-xs text-slate-300">
            {t('misc.install.iosTap')} <span className="font-semibold text-white">{t('misc.install.share')}</span> {t('misc.install.iosButton')}
            <span aria-hidden> ⬆️ </span>
            {t('misc.install.iosBottom')} <span className="font-semibold text-white">{t('misc.install.addToHome')}</span>
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-slate-300">{t('misc.install.generic')}</div>
        )}
      </div>
      {!ios && deferred && (
        <button onClick={install} className="btn-primary flex-none px-4 py-2 text-sm">
          {t('misc.install.install')}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label={t('misc.install.dismiss')}
        className="flex-none rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
