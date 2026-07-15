import type { Metadata } from 'next';
import { TogetherPlanner } from '@/components/TogetherPlanner';

export const metadata: Metadata = {
  title: 'Tonight, Together · WatchVerdict',
};

export default function TogetherPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">👪 Tonight, Together</h1>
      <p className="mt-2 text-sm text-slate-400">
        One pick the whole room will actually agree on. Add who’s watching, and we find a title that
        scores well for <em>everyone</em> — and never suggests something on someone’s hard-no list.
      </p>
      <TogetherPlanner />
    </div>
  );
}
