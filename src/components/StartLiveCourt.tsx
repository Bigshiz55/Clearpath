'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/i18n/I18nProvider';

export function StartLiveCourt() {
  const router = useRouter();
  const supabase = createClient();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('court_create', { p_media_type: 'any' });
    if (error) {
      setLoading(false);
      setError(error.code === '42P01' ? t('together.liveCourtSetupNeeded') : error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const code = row?.code as string;
    const token = row?.host_token as string;
    if (!code) { setLoading(false); setError(t('together.couldNotCreateRoom')); return; }
    try {
      localStorage.setItem(`court_host_${code}`, token);
    } catch { /* ignore */ }
    router.push(`/court/${code}`);
  }

  return (
    <div>
      <button onClick={start} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/25">
        {loading ? t('together.creatingRoom') : `🌐 ${t('together.startLiveCourtBtn')}`}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
