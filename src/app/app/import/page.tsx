import type { Metadata } from 'next';
import { ImportForm } from '@/components/ImportForm';

export const metadata: Metadata = {
  title: 'Import your history · WatchVerdict',
};

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Import your history</h1>
      <p className="mt-2 text-sm text-slate-400">
        Coming from another app? Drop in a <span className="text-slate-200">CSV export</span> — or paste a list.
        We&apos;ll match each title, carry over your ratings, and mark it watched, so your history and DNA
        show up right away.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
        <span className="text-slate-300">Works with CSV exports from</span> Letterboxd, Trakt, Simkl, TV Time, Netflix — anything with a title (and optional rating) column. Ratings on a 5-star scale (Letterboxd) are converted to /10 automatically; TV episodes collapse to one entry per show.
        <div className="mt-2 text-slate-300">Or just paste a list:</div>
        Prisoners (2013) - 9
        <br />
        Mare of Easttown 9
        <br />
        The Fall
      </div>

      <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
        <span className="font-semibold">TV Time refugee?</span> If your export is a <code className="rounded bg-black/30 px-1">.zip</code>, unzip it first and pick the <code className="rounded bg-black/30 px-1">.csv</code> inside. If your file only has IDs and no titles, export to Letterboxd or Trakt first, then bring that CSV here.
      </div>

      <ImportForm />
    </div>
  );
}
