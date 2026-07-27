import type { Metadata } from 'next';
import Link from 'next/link';
import { ReVerdictDelivery } from '@/components/ReVerdictDelivery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The re-Verd1ct' };

export default function ReVerdictPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          The re-Verd1<span className="text-amber-400">c</span>t
        </h1>
        <p className="mt-1 text-base leading-relaxed text-slate-300">
          One ruling on what is worth watching <em>again</em>. Mark things you have already seen with the{' '}
          <span className="font-black text-amber-300">R</span>, then hit the gavel.
        </p>
      </div>

      <ReVerdictDelivery />

      <p className="text-xs text-slate-500">
        Judged on your own rating and how long it has been — not on the critics, because you already know
        whether you like it.{' '}
        <Link href="/app/verdict" className="font-semibold text-brand-300 underline underline-offset-2">
          Looking for something new instead?
        </Link>
      </p>
    </div>
  );
}
