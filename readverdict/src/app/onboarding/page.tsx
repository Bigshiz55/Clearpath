import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { InterviewFlow } from '@/components/onboarding/InterviewFlow';

export const metadata: Metadata = { title: 'Reader Interview' };

export default function OnboardingPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="60-second setup"
        title="The Reader Interview"
        description="A few quick questions so ReadVerdict can argue your case. No account needed — answers stay on this device until you connect one."
      />
      <InterviewFlow />
    </div>
  );
}
