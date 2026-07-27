import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { QuickTasteQuiz } from '@/components/QuickTasteQuiz';
import { DnaQuiz } from '@/components/DnaQuiz';
import { TasteQuizModes, type QuizMode } from '@/components/TasteQuizModes';
import { loadDnaSignals, countCalibrationAnswers } from '@/lib/preference/dnaSignals';
import { CALIBRATION_SIZE, EARLY_COMPLETE } from '@/lib/preference/calibration';

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
        <TitlesLane userId={user?.id ?? null} sessionId={sessionId} />
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
 * The title lane is the existing calibration, unchanged — same component, same
 * three actions, same finite length. Both metrics start at their real server
 * values and are computed independently: `answered` drives quiz progress,
 * `tally` drives DNA confidence, and the two must never mirror each other.
 */
async function TitlesLane({ userId, sessionId }: { userId: string | null; sessionId?: string | undefined }) {
  const supabase = createClient();
  const tally = userId ? await loadDnaSignals(supabase, userId, sessionId ? { sessionId } : {}) : undefined;
  const answered = userId ? await countCalibrationAnswers(supabase, userId, sessionId) : 0;

  return (
    <DnaQuiz
      initialTally={tally}
      calibration={{
        total: CALIBRATION_SIZE,
        answered,
        showQuizProgress: true,
        checkpointAt: EARLY_COMPLETE,
        source: 'calibration',
        endpoint: '/api/calibration',
        sessionId,
        doneHref: sessionId ? '/app/dna' : '/app/watch',
        label: 'Watch DNA calibration',
      }}
    />
  );
}
