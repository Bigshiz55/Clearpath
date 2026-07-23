'use client';

import { useEffect, useState } from 'react';
import { getQuickAddToken, regenerateQuickAddToken } from '@/lib/actions/profile';
import { useT } from '@/i18n/I18nProvider';

function Copy({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10"
    >
      {done ? t('account.connect.copied') : label}
    </button>
  );
}

export function ConnectPhone() {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    getQuickAddToken()
      .then((r) => (r.ok && r.token ? setToken(r.token) : setError(r.error ?? t('account.connect.failed'))))
      .catch(() => setError(t('account.connect.failed')));
  }, [t]);

  const endpoint = token ? `${origin}/api/quick-add?token=${token}&q=` : '';

  async function roll() {
    setToken(null);
    const r = await regenerateQuickAddToken();
    if (r.ok && r.token) setToken(r.token);
    else setError(r.error ?? t('account.connect.failed'));
  }

  if (error) {
    return <p className="card p-4 text-sm text-red-200">{error}</p>;
  }
  if (!token) return <p className="text-sm text-slate-400">{t('account.connect.loadingKey')}</p>;

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="text-sm font-semibold text-white">{t('account.connect.quickAddKey')}</div>
        <p className="mt-1 text-xs text-slate-400">{t('account.connect.keepPrivate')}</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-xs text-brand-200">{token}</code>
          <Copy text={token} label={t('account.connect.copyKey')} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] text-slate-300">{endpoint}</code>
          <Copy text={endpoint} label={t('account.connect.copyUrl')} />
        </div>
        <button onClick={roll} className="btn-ghost mt-2 text-xs text-slate-400">{t('account.connect.resetKey')}</button>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-white">{t('account.connect.siriHeader')}</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>{t('account.connect.siri1a')} <span className="text-white">{t('account.connect.shortcutsApp')}</span> {t('account.connect.siri1b')} <span className="text-white">+</span> {t('account.connect.siri1c')}</li>
          <li>{t('account.connect.addAction')} <span className="text-white">{t('account.connect.actDictate')}</span></li>
          <li>{t('account.connect.addAction')} <span className="text-white">{t('account.connect.actGetUrl')}</span> {t('account.connect.siri3a')} <span className="text-white">{t('account.connect.copyUrl')}</span> {t('account.connect.siri3b')} <span className="text-white">{t('account.connect.dictatedTextVar')}</span> {t('account.connect.siri3c')} <code className="text-[11px]">…&amp;q=[Dictated&nbsp;Text]</code>{t('account.connect.fullStop')}</li>
          <li>{t('account.connect.nameIt')} <span className="text-white">{t('account.connect.actAddName')}</span> {t('account.connect.siri4')} <span className="text-white">{t('account.connect.saySiri')}</span></li>
        </ol>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-white">{t('account.connect.screenshotHeader')}</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          <li>{t('account.connect.shot1a')} <span className="text-white">{t('account.connect.showInShareSheet')}</span> {t('account.connect.shot1b')} <span className="text-white">{t('account.connect.images')}</span>{t('account.connect.fullStop')}</li>
          <li>{t('account.connect.add')} <span className="text-white">{t('account.connect.extractText')}</span> {t('account.connect.shortcutInput')}</li>
          <li>{t('account.connect.add')} <span className="text-white">{t('account.connect.getContentsUrl')}</span> {t('account.connect.shot3a')} <span className="text-white">{t('account.connect.copyUrl')}</span> {t('account.connect.shot3b')} <span className="text-white">{t('account.connect.extractedTextVar')}</span> {t('account.connect.shot3c')}<code className="text-[11px]">&amp;q=[Extracted&nbsp;Text]</code>{t('account.connect.shot3d')}</li>
          <li>{t('account.connect.nameIt')} <span className="text-white">{t('account.connect.actAddName')}</span> {t('account.connect.shot4')} <span className="text-white">{t('account.connect.shareAddName')}</span></li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">{t('account.connect.screenshotNote')}</p>
      </div>

      <p className="text-xs text-slate-500">
        {t('account.connect.androidNote1')} <span className="text-slate-300">{t('account.connect.shareWatchVerdict')}</span>{t('account.connect.fullStop')}
      </p>
    </div>
  );
}
