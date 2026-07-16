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
    <section className={`overflow-hidden rounded-2xl border border-gold-400/30 bg-gradient-to-br from-gold-500/10 to-brand-500/10 p-5 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="text-4xl" aria-hidden>⚖️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-white sm:text-xl">Can’t agree? Take it to court.</h2>
          <p className="mt-1 text-sm text-slate-300">
            Watching with other people? Start a courtroom, share the code, and everyone joins from their own phone.
            Each person’s taste counts — nobody gets stuck with something on their hard-no list — and the judge
            hands down <span className="font-semibold text-white">one verdict the whole room is happy with.</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={loading} className="btn-primary px-5 py-2.5 disabled:opacity-60">
              {loading ? 'Opening the courtroom…' : '⚖️ Start a courtroom'}
            </button>
            <span className="text-xs text-slate-400">Invite 1–8 friends · everyone votes · one pick wins</span>
          </div>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        </div>
      </div>
    </section>
  );
}
