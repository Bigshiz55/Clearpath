import type { Metadata } from 'next';
import Link from 'next/link';
import { RapidFireDemo } from '@/components/RapidFireDemo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rapid Fire · WatchVerdict' };

export default function RapidFirePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Rapid Fire</h1>
        <p className="mt-1 text-base leading-relaxed text-slate-300">
          An import knows you watched something. It has no idea whether you liked it. This is how that gets
          fixed — one title, one tap, a couple of minutes.
        </p>
      </div>

      <RapidFireDemo />

      <p className="text-xs text-slate-500">
        Already have an export?{' '}
        <Link href="/import-taste" className="font-semibold text-brand-300 underline underline-offset-2">
          Bring your real history in
        </Link>{' '}
        and this runs against that instead. Netflix, and any tracker that exports CSV.
      </p>
    </div>
  );
}
