import type { Metadata } from 'next';
import { RewatchQuiz } from '@/components/RewatchQuiz';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How you rewatch' };

export default function RewatchQuizPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">How do you rewatch?</h1>
        <p className="mt-1 text-base leading-relaxed text-slate-300">
          Eight statements, about a minute. It learns two things nothing else in the app knows: whether you
          go back for comfort or to rediscover, and how long a gap you need first.
        </p>
      </div>
      <RewatchQuiz />
    </div>
  );
}
