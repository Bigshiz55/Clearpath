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

  // No repeated heading/paragraph here — the rating tile owns the viewport and
  // the one-time explanation lives inside DnaQuiz's intro sheet.
  return <DnaQuiz totalRated={totalRated} />;
}
