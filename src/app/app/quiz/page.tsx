import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { DnaQuiz } from '@/components/DnaQuiz';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Build your Watch DNA · WatchVerdict',
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
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🧬 Build your Watch DNA</h1>
      <p className="mt-2 text-sm text-slate-400">
        Have you seen it? If so, how was it? Every answer sharpens your recommendations — and
        “haven’t seen it” never counts against you. Stop anytime; update it whenever.
      </p>
      <div className="mt-5">
        <DnaQuiz totalRated={totalRated} />
      </div>
    </div>
  );
}
