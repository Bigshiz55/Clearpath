import { notFound } from 'next/navigation';
import { TourHub } from '@/components/onboarding/TourHub';

export const dynamic = 'force-dynamic';

/** Harness only — the real /app/tour needs a session. */
export default function DevTour() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page flex min-h-dvh items-start justify-center py-8">
      <TourHub />
    </main>
  );
}
