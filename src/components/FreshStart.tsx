'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/i18n/I18nProvider';

/**
 * A "start fresh" flow — signs out of any current session and mints a brand-new
 * anonymous guest, then drops you where `to` points (the Taste Quiz by default,
 * or the cold-start home) with zero history. Share the link so each person can
 * build their own DNA clean on their own device. Powers every clean-slate route
 * (/fresh, /begin, /start, /newuser) so they stay identical.
 */
export function FreshStart({ to = '/app/quiz' }: { to?: string }) {
  const router = useRouter();
  const t = useT();
  const [err, setErr] = useState<string | null>(null);
  // Only ever redirect to an internal path (never an attacker-supplied URL).
  const dest = to.startsWith('/') && !to.startsWith('//') ? to : '/app/quiz';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
        const { error } = await supabase.auth.signInAnonymously();
        if (!active) return;
        if (error) {
          setErr(error.message);
          return;
        }
        router.replace(dest);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : t('misc.fresh.couldNotStart'));
      }
    })();
    return () => {
      active = false;
    };
  }, [router, dest, t]);

  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <p className="mt-4 text-sm text-slate-300">{t('misc.fresh.starting')}</p>
        {err && (
          <p className="mt-2 text-xs text-rose-300">
            {err} —{' '}
            <a href={dest} className="underline">
              {t('misc.fresh.continueAnyway')}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
