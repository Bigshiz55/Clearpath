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

  // Compact, height-bounded shell so the single-screen quiz fits within the app
  // chrome (top nav + bottom nav) without scrolling; the poster flexes to fill.
  return (
    <div className="mx-auto flex h-[calc(100svh-8.5rem)] max-w-md flex-col">
      <div className="shrink-0 text-center">
        <h1 className="text-lg font-bold text-white">🧬 Build your Watch DNA</h1>
        <p className="mt-0.5 text-xs text-slate-400">Rate what you’ve seen — “haven’t seen it” never counts against you.</p>
      </div>
      <div className="mt-2 min-h-0 flex-1">
        <DnaQuiz totalRated={totalRated} />
      </div>
    </div>
  );
}
