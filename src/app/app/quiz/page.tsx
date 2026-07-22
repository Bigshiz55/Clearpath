import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { QuizModes } from '@/components/QuizModes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Taste Quiz · WatchVerdict',
};

export default async function QuizPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let totalRated = 0;
  if (user) {
    const { count } = await supabase
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('rating', 'is', null);
    totalRated = count ?? 0;
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🍿 Taste Quiz</h1>
      <p className="mt-2 text-sm text-slate-400">
        A poster pops up — call it <span className="font-semibold text-emerald-200">Yes</span>,{' '}
        <span className="font-semibold text-red-200">No</span>, <span className="font-semibold text-amber-200">Maybe</span>, or
        Haven’t seen. Every 50 recalculates your algorithm, and the more you play the sharper it gets.
      </p>
      <QuizModes totalRated={totalRated} />
    </div>
  );
}
