'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/i18n/I18nProvider';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    router.push('/');
    router.refresh();
  }

  return (
    <button onClick={signOut} disabled={loading} className={className ?? 'btn-ghost'}>
      {loading ? t('misc.signOut.signingOut') : t('misc.signOut.signOut')}
    </button>
  );
}
