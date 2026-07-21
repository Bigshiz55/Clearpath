'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCharity } from '@/lib/actions/profile';
import { CHARITIES } from '@/lib/charities';
import { PinkRibbon } from '@/components/PinkRibbon';
import { PLEDGE } from '@/lib/proPlan';

export function CharityPicker({ current, isPro = false }: { current: string | null; isPro?: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(current);
  const [pending, setPending] = useState<string | null>(null);
  const [, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function choose(id: string) {
    if (id === sel) return;
    setErr(null);
    const prev = sel;
    setSel(id);
    setPending(id);
    start(async () => {
      const r = await updateCharity({ charity: id });
      setPending(null);
      if (!r.ok) {
        setErr(r.error ?? 'Could not save.');
        setSel(prev);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <PinkRibbon className="h-6 w-6 flex-none text-[#ff6fae]" />
        <div>
          <h2 className="text-lg font-bold text-white">Choose your cause</h2>
          <p className="text-sm text-slate-400">
            ${PLEDGE.amountUsd}/mo of your membership goes here. {isPro ? 'Change it anytime.' : 'Pick now — it activates when you go Pro.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {CHARITIES.map((c) => {
          const active = sel === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c.id)}
              disabled={pending !== null}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition disabled:opacity-70 ${
                active ? 'border-pink-400/70 bg-pink-500/[0.12]' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>{c.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-white">{c.name}</span>
                  {active && <span className="text-xs font-black text-pink-300">{pending === c.id ? '…' : '✓'}</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">{c.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
      {err && <p className="mt-2 text-xs text-rose-300">{err}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        WatchVerdict is the donor of record; you direct where it goes and get an impact confirmation — not a tax receipt.
      </p>
    </section>
  );
}
