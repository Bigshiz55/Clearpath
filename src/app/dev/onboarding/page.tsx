import { notFound } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

export const dynamic = 'force-dynamic';

/** Harness only — the real /onboarding needs a session. */
export default function DevOnboarding() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page flex min-h-dvh items-center justify-center py-8">
      <OnboardingForm defaultName="Scott Turner" />
    </main>
  );
}
