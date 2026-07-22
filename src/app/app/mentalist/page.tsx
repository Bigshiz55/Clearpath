import type { Metadata } from 'next';
import { Mentalist } from '@/components/Mentalist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mentalist · WatchVerdict' };

export default function MentalistPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🔮 WatchVerdict Mentalist</h1>
      <p className="mt-2 text-sm text-slate-300">
        Name a few titles you love. We read the hidden threads between them — tone, pace, story motifs, the
        kind of lead you gravitate to — and predict the next handful you’ll actually pick. Then save the whole
        list in one tap.
      </p>
      <div className="mt-6">
        <Mentalist />
      </div>
    </div>
  );
}
