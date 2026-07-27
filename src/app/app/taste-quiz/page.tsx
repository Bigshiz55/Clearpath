import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { QuickTasteQuiz } from '@/components/QuickTasteQuiz';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Quick Taste Quiz · WatchVerdict' };

/**
 * A second run of the quiz should not re-ask what the first one settled. The
 * provenance rows are the record of that, so they seed both the "already asked"
 * list and the attribute evidence the selector uses to skip covered ground.
 *
 * `taste_quiz_answers` arrives in migration 0034. Until it is applied the query
 * fails and the quiz simply starts cold — a fresh quiz is a far better failure
 * than a blank screen.
 */
export default async function TasteQuizPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const asked: string[] = [];
  const known: Record<string, number> = {};

  if (user) {
    const { data } = await supabase
      .from('taste_quiz_answers')
      .select('question_id, attributes')
      .eq('user_id', user.id)
      .limit(500);
    for (const row of data ?? []) {
      const qid = row.question_id as string | null;
      if (qid) asked.push(qid);
      const attrs = row.attributes as Array<{ key?: string; weight?: number }> | null;
      for (const a of attrs ?? []) {
        if (!a?.key) continue;
        known[a.key] = (known[a.key] ?? 0) + Math.abs(a.weight ?? 0.5);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <QuickTasteQuiz asked={asked} known={known} canSave={Boolean(user)} />
    </div>
  );
}
