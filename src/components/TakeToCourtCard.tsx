'use client';

import { useStartCourt } from '@/lib/court/useStartCourt';

/**
 * The headline group-decision entry: "Can't decide? Open a Verdict Room."
 * Starts the same live Court room as every other entry point (shared
 * `useStartCourt` — one creation path, no duplicated RPC logic). Everyone
 * weighs in from their own phone; WatchVerd1ct scores the room and returns
 * one Verd1ct (never "a judge" — see the NO_JUDGE language rule enforced on
 * the room itself).
 */
export function TakeToCourtCard({ className = '' }: { className?: string }) {
  const { start, loading, error } = useStartCourt();

  return (
    <section className={`overflow-hidden rounded-2xl border border-gold-400/30 bg-gradient-to-br from-gold-500/10 to-brand-500/10 p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden>⚖️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            Can’t decide with your partner, family, or friends?{' '}
            <span className="bg-gradient-to-r from-gold-300 to-brand-300 bg-clip-text text-transparent">Open a Verdict Room.</span>
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-200">
            Start a Verdict Room and share the <span className="font-semibold text-white">QR code</span>. Everyone scans it and
            joins from their own phone, makes their own picks and vetoes, and WatchVerd1ct{' '}
            <span className="font-semibold text-white">adds up everyone’s taste and returns one Verd1ct the whole room is happy with.</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">📱 Scan the QR</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">🙋 Everyone votes</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">⚖️ One Verd1ct wins</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={loading} className="btn-primary px-6 py-3 text-lg disabled:opacity-60">
              {loading ? 'Opening the room…' : '⚖️ Start a Verdict Room'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </section>
  );
}
