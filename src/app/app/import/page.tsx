import type { Metadata } from 'next';
import { ImportForm } from '@/components/ImportForm';

export const metadata: Metadata = {
  title: 'Import your history · WatchVrdIQt',
};

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Import your history</h1>
      <p className="mt-2 text-sm text-slate-400">
        Paste everything you&apos;ve already watched — one title per line, with an optional rating
        out of 10. We&apos;ll match each to the right movie or show and mark it watched, so your
        history and ratings show up right away.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
        <span className="text-slate-300">Any of these work:</span>
        <br />
        Prisoners (2013) - 9
        <br />
        Mare of Easttown 9
        <br />
        Wisting: 8
        <br />
        The Fall
      </div>

      <ImportForm />
    </div>
  );
}
