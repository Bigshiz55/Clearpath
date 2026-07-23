'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/i18n/I18nProvider';

export function GuestSaveButton({ className = '' }: { className?: string }) {
  const supabase = createClient();
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (!email.trim() || password.length < 6) {
      setError(t('misc.guestSave.validation'));
      return;
    }
    setLoading(true);
    setError(null);
    // Links an email/password identity onto the current anonymous user, keeping
    // the same account id — so watchlist, ratings and taste all carry over.
    const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className || 'btn-secondary'}>
        {t('misc.guestSave.cta')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center">
                <div className="text-3xl">✅</div>
                <h3 className="mt-2 text-lg font-bold text-white">{t('misc.guestSave.savedTitle')}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {t('misc.guestSave.savedBody1')} <span className="text-slate-200">{email}</span>{t('misc.guestSave.savedBody2')}
                </p>
                <button onClick={() => setOpen(false)} className="btn-primary mt-5 w-full">{t('misc.guestSave.done')}</button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">{t('misc.guestSave.cta')}</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {t('misc.guestSave.formBody')}
                </p>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('misc.guestSave.emailPlaceholder')} className="input mt-4" autoComplete="email" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('misc.guestSave.passwordPlaceholder')} className="input mt-2" autoComplete="new-password" />
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <button onClick={save} disabled={loading} className="btn-primary flex-1">{loading ? t('misc.guestSave.saving') : t('misc.guestSave.saveAccount')}</button>
                  <button onClick={() => setOpen(false)} className="btn-ghost">{t('misc.guestSave.later')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
