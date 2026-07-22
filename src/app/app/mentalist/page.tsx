import type { Metadata } from 'next';
import { Mentalist } from '@/components/Mentalist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Build Your Case · WatchVerdict' };

export default function MentalistPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🧬 Build Your Case</h1>
      <p className="mt-2 text-sm text-slate-300">
        Name a few titles you love. We read the hidden threads between them — tone, pace, story motifs, the
        kind of lead you gravitate to — to start building your Taste DNA, then predict the next handful you’ll
        actually pick. Save the whole list in one tap.
      </p>
      <p className="mt-1 text-[11px] text-slate-500">Powered by the WatchVerdict Mentalist</p>
      <div className="mt-6">
        <Mentalist />
      </div>
    </div>
  );
}
