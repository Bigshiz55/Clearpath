'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * The headline group-decision entry: "Can't decide? Take it to court." Starts a
 * Live Taste Court — friends join from their own phones, each one's real taste
 * syncs in, and the judge returns one verdict the whole room is happy with.
 */
export function TakeToCourtCard({ className = '' }: { className?: string }) {
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
    if (!code) {
      setLoading(false);
      setError('Could not create the courtroom. Try again.');
      return;
    }
    try {
      localStorage.setItem(`court_host_${code}`, token);
    } catch {
      /* ignore */
    }
    router.push(`/court/${code}`);
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-gold-400/30 bg-gradient-to-br from-gold-500/10 to-brand-500/10 p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden>⚖️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Can’t decide with your partner, family, or friends?{' '}
            <span className="bg-gradient-to-r from-gold-300 to-brand-300 bg-clip-text text-transparent">Take them to court.</span>
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-200">
            Start a courtroom and share the <span className="font-semibold text-white">QR code</span>. Everyone scans it and
            joins from their own phone, makes their own picks and vetoes, and the judge{' '}
            <span className="font-semibold text-white">adds up everyone’s taste and hands down one verdict the whole room is happy with.</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">📱 Scan the QR</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">🙋 Everyone votes</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">⚖️ One verdict wins</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={loading} className="btn-primary px-6 py-3 text-lg disabled:opacity-60">
              {loading ? 'Opening the courtroom…' : '⚖️ Take them to court'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </section>
  );
}
