import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { CourtroomHub } from '@/components/courtroom/CourtroomHub';

export const metadata: Metadata = { title: 'Courtroom' };

export default function CourtroomPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Every book gets a trial"
        title="The Courtroom"
        description="Put a book on trial and get the verdict — the charges, both sides of the case, and a decisive call tuned to you."
      />
      <CourtroomHub />
    </div>
  );
}
