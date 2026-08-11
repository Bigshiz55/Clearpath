import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * RETIRED — the title-grid calibration.
 *
 * `/app/taste-quiz` was the canonical way to build a Taste DNA. The DNA Showdown
 * replaces it: it asks the same engine the same kind of question, but a forced
 * comparison separates two titles on a specific axis, where a grid of twelve
 * independent ratings mostly re-learns what popularity already told us.
 *
 * A REDIRECT RATHER THAN A SECOND FLOW, deliberately. This route is linked from
 * the nav, the DNA hub, the landing page and outreach links, so it cannot simply
 * 404. But keeping it ALIVE alongside the Showdown is the mistake that produced
 * this file's predecessor: `/app/quiz` and `/app/taste-quiz` were two
 * independently maintained "rate titles to build your DNA" flows that drifted
 * apart until one had to be retired to a redirect stub. Two permanent
 * calibration systems is one too many, and the count does not improve by adding
 * a third.
 *
 * `TitleGridCalibration` and its server action are untouched and still used by
 * the onboarding grid; what is retired is this route as a rival entry point.
 */
export default function RetiredTasteQuizRoute({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const session = searchParams?.session;
  redirect(session ? `/app/showdown?session=${encodeURIComponent(session)}` : '/app/showdown');
}
