'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function StartLiveCourt() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('court_create', { p_media_type: 'any' });
    if (error) {
      setLoading(false);
      setError(error.code === '42P01' ? 'Live Court needs a one-time setup (run migration 0004).' : error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const code = row?.code as string;
    const token = row?.host_token as string;
    if (!code) { setLoading(false); setError('Could not create a room.'); return; }
    try {
      localStorage.setItem(`court_host_${code}`, token);
    } catch { /* ignore */ }
    router.push(`/court/${code}`);
  }

  return (
    <div>
      {/* THE page's one filled button. It was a tinted outline pill with a
          fifteen-word label; the single primary action reads as one. */}
      <button
        onClick={start}
        disabled={loading}
        data-testid="start-court"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-base font-bold text-white shadow-glow transition hover:bg-brand-500 disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none sm:w-auto"
      >
        {loading ? 'Creating room…' : 'Start a Court'}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
