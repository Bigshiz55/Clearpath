import type { Metadata } from 'next';
import { QuizGame } from '@/components/QuizGame';

export const metadata: Metadata = {
  title: 'Taste Quiz · WatchVrdIQt',
};

export default function QuizPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🍿 Taste Quiz</h1>
      <p className="mt-2 text-sm text-slate-400">
        Posters flash up — rate what you know <span className="text-slate-300">1–10</span>, skip what
        you haven’t seen. A minute of tapping builds your profile and sharpens every recommendation.
      </p>
      <QuizGame />
    </div>
  );
}
