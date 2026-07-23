'use client';

import { useState } from 'react';
import { createVerdictShare } from '@/lib/actions/share';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';
import type { MediaType } from '@/lib/types';

export function ShareDialog({
  tmdbId,
  mediaType,
  personalLabel,
  onClose,
}: {
  tmdbId: number;
  mediaType: MediaType;
  personalLabel: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const t = useT();
  const [includePersonal, setIncludePersonal] = useState(false);
  const [expires, setExpires] = useState<'never' | '7' | '30'>('never');
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function create() {
    setLoading(true);
    const res = await createVerdictShare({
      tmdbId,
      mediaType,
      includePersonal,
      expiresInDays: expires === 'never' ? null : Number(expires),
    });
    setLoading(false);
    if (!res.ok || !res.url) {
      toast.show(res.error ?? t('title.share.toastCouldNotCreate'), 'error');
      return;
    }
    setUrl(res.url);
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t('title.share.toastCopied'), 'success');
    } catch {
      toast.show(t('title.share.toastCopyFailed'), 'error');
    }
  }

  async function nativeShare() {
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'WatchVerdict', url });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">{t('title.share.heading')}</h3>
        <p className="mt-1 text-sm text-slate-400">{t('title.share.subtitle')}</p>

        {!url ? (
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
              <span className="text-sm text-slate-200">
                {t('title.share.includePersonal', { label: personalLabel })}
                <span className="block text-xs text-slate-500">{t('title.share.includePersonalHint')}</span>
              </span>
              <input
                type="checkbox"
                checked={includePersonal}
                onChange={(e) => setIncludePersonal(e.target.checked)}
                className="h-5 w-5 accent-brand-500"
              />
            </label>

            <div>
              <div className="label">{t('title.share.expiryLabel')}</div>
              <div className="flex gap-2">
                {(['never', '7', '30'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setExpires(v)}
                    className={`chip border ${expires === v ? 'chip-active' : ''}`}
                  >
                    {v === 'never' ? t('title.share.expiryNever') : t('title.share.expiryDays', { n: v })}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={create} disabled={loading} className="btn-primary w-full">
              {loading ? t('title.share.creating') : t('title.share.createLink')}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 p-2">
              <input readOnly value={url} className="flex-1 bg-transparent px-2 text-sm text-slate-200 outline-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="btn-secondary flex-1">
                {t('title.share.copyLink')}
              </button>
              <button onClick={nativeShare} className="btn-primary flex-1">
                {t('title.share.shareBtn')}
              </button>
            </div>
            <p className="text-center text-xs text-slate-500">
              {t('title.share.deactivateNote')}
            </p>
          </div>
        )}

        <button onClick={onClose} className="btn-ghost mt-3 w-full">
          {t('title.share.close')}
        </button>
      </div>
    </div>
  );
}
