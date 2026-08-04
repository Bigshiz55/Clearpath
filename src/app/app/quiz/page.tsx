import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * /app/quiz used to be a second, parallel Watch DNA onboarding flow
 * (DnaQuiz — a one-at-a-time card swipe) alongside /app/taste-quiz
 * (TitleGridCalibration — the recognition grid). Both wrote real signal
 * through the same engine, so they weren't a scam-vs-real split — but two
 * maintained implementations of "rate titles to build your DNA" drift apart
 * over time, and this route is the one embedded in growth/outreach links and
 * a few clean-slate entry points (`/begin`, `/start`) that may already be
 * distributed, so it redirects rather than 404s. /app/taste-quiz is the
 * canonical flow going forward: it's the one the persistent nav, the DNA
 * hub, and the landing page already point to, and it's had the more active
 * recent development.
 */
export default function QuizPage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const session = searchParams?.session;
  redirect(session ? `/app/taste-quiz?session=${encodeURIComponent(session)}` : '/app/taste-quiz');
}
