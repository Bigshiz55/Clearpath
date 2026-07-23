'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { quickAddByText } from '@/lib/actions/watchlist';
import { useT } from '@/i18n/I18nProvider';

export function ShareTargetHandler({ text }: { text: string }) {
  const t = useT();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!text.trim()) {
      setState('error');
      setMessage(t('misc.shareTarget.nothingShared'));
      return;
    }
    quickAddByText(text)
      .then((r) => {
        if (r.ok) { setState('done'); setMessage(r.added ?? t('misc.shareTarget.addedToList')); }
        else { setState('error'); setMessage(r.error ?? t('misc.shareTarget.couldNotAdd')); }
      })
      .catch(() => { setState('error'); setMessage(t('misc.shareTarget.wentWrong')); });
  }, [text, t]);

  return (
    <div className="card p-8 text-center">
      {state === 'working' && (
        <>
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
          <p className="mt-3 text-sm text-slate-300">{t('misc.shareTarget.adding')}</p>
        </>
      )}
      {state === 'done' && (
        <>
          <div className="text-4xl">✅</div>
          <h1 className="mt-2 text-lg font-bold text-white">{t('misc.shareTarget.added')}</h1>
          <p className="mt-1 text-sm text-slate-300">{message}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/app/watchlist" className="btn-primary">{t('misc.shareTarget.viewWatchlist')}</Link>
            <Link href="/app" className="btn-secondary">{t('misc.shareTarget.done')}</Link>
          </div>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="text-3xl">⚠️</div>
          <p className="mt-2 text-sm text-red-200">{message}</p>
          <Link href="/app" className="btn-secondary mt-4 inline-flex">{t('misc.shareTarget.back')}</Link>
        </>
      )}
    </div>
  );
}
