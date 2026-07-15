import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getMonthlyDocket } from '@/lib/docket';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The Docket · WatchVerdict' };

export default async function DocketPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const docket = await getMonthlyDocket(supabase, user?.id ?? '', new Date());

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">
            This Month’s Docket
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{docket.monthLabel}’s cases</h1>
          <p className="mt-2 text-sm text-slate-400">
            A few viewing cases to close this month — built from your real watch history, tracked from what you
            actually finish. Close all {docket.total} for the seal.
          </p>
        </div>
        {docket.allClosed && <CaseClosedSeal />}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-gold-400 transition-all"
            style={{ width: `${(docket.closed / Math.max(1, docket.total)) * 100}%` }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums text-slate-300">
          {docket.closed}/{docket.total} closed
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {docket.missions.map((m) => (
          <div
            key={m.id}
            className={`card p-4 ${m.done ? 'border-emerald-400/40 bg-emerald-500/5' : ''}`}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/5 text-xl" aria-hidden>
                {m.done ? '✅' : m.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-sm font-semibold ${m.done ? 'text-emerald-100' : 'text-white'}`}>{m.title}</h3>
                  <span className="flex-none text-xs font-bold tabular-nums text-slate-400">
                    {m.progress}/{m.target}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{m.detail}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className={`h-full rounded-full ${m.done ? 'bg-emerald-400' : 'bg-brand-400'}`}
                    style={{ width: `${Math.min(100, (m.progress / Math.max(1, m.target)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Cases are set at the start of the month and tracked from titles you mark as watched. Mark things watched on
        their <Link href="/app/watchlist" className="text-brand-300 underline">watchlist</Link> or verdict pages —
        nothing here is estimated.
      </p>
    </div>
  );
}

function CaseClosedSeal() {
  return (
    <div className="relative grid h-24 w-24 flex-none place-items-center">
      <div className="absolute inset-0 rounded-full border-[3px] border-gold-400/70 shadow-[0_0_0_5px_rgba(245,198,90,0.1)]" />
      <div className="absolute inset-[10px] rounded-full border border-dashed border-gold-400/50" />
      <div className="rotate-[-9deg] text-center">
        <div className="font-serif text-sm font-black leading-none tracking-wide text-gold-400" style={{ fontFamily: 'Georgia, serif' }}>
          CASE
          <br />
          CLOSED
        </div>
      </div>
    </div>
  );
}
