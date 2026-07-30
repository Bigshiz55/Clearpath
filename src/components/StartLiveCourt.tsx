'use client';

import { useStartCourt } from '@/lib/court/useStartCourt';

export function StartLiveCourt() {
  const { start, loading, error } = useStartCourt();

  return (
    <div>
      {/* The page's one obvious primary action — full-width, unmissable, one
          thumb reach on a phone. */}
      <button
        onClick={start}
        disabled={loading}
        data-testid="start-court"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-6 py-4 text-lg font-black tracking-tight text-white shadow-glow transition hover:bg-brand-500 active:scale-[0.99] disabled:bg-white/10 disabled:text-slate-500 disabled:shadow-none"
      >
        {loading ? 'Opening the room…' : 'Start a Verdict Room'}
      </button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
