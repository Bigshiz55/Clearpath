import { Antenna } from 'lucide-react';

/** Shared honest empty state — names what's missing, never a blank page. */
export function PackEmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-6 text-center">
      <Antenna className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
      <h2 className="mt-3 text-lg font-bold text-white">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">{detail}</p>
      <p className="mt-3 text-[11px] text-slate-500">Listings refresh daily.</p>
    </div>
  );
}
