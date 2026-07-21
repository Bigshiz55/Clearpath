import type { Metadata } from 'next';
import { QuizModes } from '@/components/QuizModes';

export const metadata: Metadata = {
  title: 'Taste Quiz · WatchVerdict',
};

export default function QuizPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🍿 Taste Quiz</h1>
      <p className="mt-2 text-sm text-slate-400">
        A poster pops up — hit <span className="font-semibold text-emerald-200">+ Like</span> or{' '}
        <span className="font-semibold text-red-200">− Nope</span>, skip what you haven’t seen. Rip through a
        hundred in a couple of minutes and your DNA gets sharp fast. Want finer control? Switch to 1–10.
      </p>
      <QuizModes />
    </div>
  );
}
