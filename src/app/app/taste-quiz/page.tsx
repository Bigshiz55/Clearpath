import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { QuickTasteQuiz } from '@/components/QuickTasteQuiz';
import { TitleGridCalibration } from '@/components/TitleGridCalibration';
import { TasteQuizModes, type QuizMode } from '@/components/TasteQuizModes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Taste Quiz · WatchVerdict' };

/**
 * THE TASTE QUIZ — one place, two instruments.
 *
 * Statements are fast and work even when you cannot remember a single title;
 * real titles are slower but a reaction to an actual film is harder evidence.
 * They feed the SAME Viewer DNA through the same preference log, so switching
 * lanes mid-way costs nothing and neither one is the "real" quiz.
 *
 * A second run of the statements should not re-ask what the first one settled,
 * so the provenance rows seed both the "already asked" list and the attribute
 * evidence the selector uses. `taste_quiz_answers` arrives in migration 0034;
 * until it is applied the query fails and the quiz starts cold, which is a far
 * better failure than a blank screen.
 */
export default async function TasteQuizPage({
  searchParams,
}: {
  searchParams?: { mode?: string; session?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const mode: QuizMode = searchParams?.mode === 'titles' ? 'titles' : 'statements';
  const sessionId = searchParams?.session || undefined;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <TasteQuizModes active={mode} sessionId={sessionId} />
      {mode === 'titles' ? (
        <TitlesLane sessionId={sessionId} />
      ) : (
        <StatementsLane userId={user?.id ?? null} />
      )}
    </div>
  );
}

async function StatementsLane({ userId }: { userId: string | null }) {
  const asked: string[] = [];
  const known: Record<string, number> = {};

  if (userId) {
    const supabase = createClient();
    const { data } = await supabase
      .from('taste_quiz_answers')
      .select('question_id, attributes')
      .eq('user_id', userId)
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

  return <QuickTasteQuiz asked={asked} known={known} canSave={Boolean(userId)} />;
}

/**
 * The title lane is a grid of twelve, not a stack of one-at-a-time judgements.
 * Recognition is the scarce thing here: showing twelve at once lets someone tap
 * what they know and ignore what they do not, and ignoring costs them nothing.
 */
function TitlesLane({ sessionId }: { sessionId?: string | undefined }) {
  return <TitleGridCalibration sessionId={sessionId} />;
}
