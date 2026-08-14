import type { Metadata } from 'next';
import { TitleGridCalibration } from '@/components/TitleGridCalibration';
import { GenreCalibration } from '@/components/onboarding/GenreCalibration';
import { DnaProgressMeter } from '@/components/onboarding/DnaProgressMeter';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Taste Quiz · WatchVerd1ct' };

/**
 * THE TASTE QUIZ — the first-run Taste DNA flow, in the fresh-user order:
 *
 *   1. GENRE CALIBRATION — the broad canonical genres, 1–10 or "not for me",
 *      each answer a real preference event. Shown only while the user has
 *      never answered a genre (source = 'genre-calibration' in the log);
 *      a returning quiz-taker goes straight to the titles.
 *   2. QUICK TASTE QUIZ — the real-titles grid.
 *
 * This page used to offer two lanes behind a chooser: a 12-statement
 * questionnaire ("I would rather laugh than be put through something") and a
 * grid of real titles to react to. The statements lane is gone.
 *
 * The titles grid is the stronger instrument and always was. A reaction to an
 * actual film is evidence; agreeing with a sentence about yourself is a guess
 * about your own taste, and people are famously bad at that — the statements
 * had to be translated into attribute claims before they could move anything,
 * while a rating on a title is already the thing the engine wants. The genre
 * step in front of it is not a statements lane returned: "how do you feel
 * about horror, 1–10" is a direct preference the engine stores natively as
 * genre affinity, not a personality sentence needing translation.
 *
 * Recognition is the scarce resource in the grid, which is why it shows
 * twelve at once: tap what you know, ignore what you do not, and ignoring
 * costs nothing.
 */
export default async function TasteQuizPage({
  searchParams,
}: {
  searchParams?: { session?: string; step?: string };
}) {
  const sessionId = searchParams?.session || undefined;

  /* Step routing: the genre step shows for a user who has never answered a
     genre, unless they explicitly asked for the titles step. Fail-open to
     the titles grid — if the log cannot be read, the long-standing quiz
     works exactly as before. */
  let showGenres = false;
  if (searchParams?.step !== 'titles') {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { count, error } = await supabase
          .from('preference_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('source', 'genre-calibration');
        showGenres = !error && (count ?? 0) === 0;
      }
    } catch {
      showGenres = false;
    }
  }

  const continueHref = sessionId ? `/app/taste-quiz?step=titles&session=${encodeURIComponent(sessionId)}` : '/app/taste-quiz?step=titles';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {/* Live DNA read-out — REAL metrics (DNA Confidence + quiz progress),
          server-computed from persisted state, refreshed only when a write
          lands. In-flow above the step content, so it can never cover a
          card. Visible during BOTH steps. */}
      <DnaProgressMeter sessionId={sessionId} />
      {showGenres ? (
        <GenreCalibration continueHref={continueHref} sessionId={sessionId} />
      ) : (
        <TitleGridCalibration sessionId={sessionId} />
      )}
    </div>
  );
}
