import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { DnaQuiz } from '@/components/DnaQuiz';
import { loadDnaSignals, countCalibrationAnswers } from '@/lib/preference/dnaSignals';
import { CALIBRATION_SIZE, EARLY_COMPLETE } from '@/lib/preference/calibration';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Build your Watch DNA · WatchVerdict',
};

export default async function QuizPage({ searchParams }: { searchParams?: { session?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // A founder test session isolates this calibration to a named session's DNA.
  const sessionId = searchParams?.session || undefined;

  // The two metrics start at their REAL server values, computed independently:
  //   • answered  → drives Quiz Progress (X of 20).
  //   • tally     → drives Watch DNA Confidence (never mirrors progress).
  let answered = 0;
  const tally = user ? await loadDnaSignals(supabase, user.id, sessionId ? { sessionId } : {}) : undefined;
  if (user) answered = await countCalibrationAnswers(supabase, user.id, sessionId);

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
