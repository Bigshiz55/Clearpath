import type { Metadata } from 'next';
import { TitleGridCalibration } from '@/components/TitleGridCalibration';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Taste Quiz · WatchVerdict' };

/**
 * THE TASTE QUIZ — real titles.
 *
 * This page used to offer two lanes behind a chooser: a 12-statement
 * questionnaire ("I would rather laugh than be put through something") and a
 * grid of real titles to react to. The statements lane is gone.
 *
 * The titles grid is the stronger instrument and always was. A reaction to an
 * actual film is evidence; agreeing with a sentence about yourself is a guess
 * about your own taste, and people are famously bad at that — the statements
 * had to be translated into attribute claims before they could move anything,
 * while a rating on a title is already the thing the engine wants.
 *
 * Recognition is the scarce resource here, which is why the grid shows twelve
 * at once: tap what you know, ignore what you do not, and ignoring costs
 * nothing.
 */
export default async function TasteQuizPage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const sessionId = searchParams?.session || undefined;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <TitleGridCalibration sessionId={sessionId} />
    </div>
  );
}
