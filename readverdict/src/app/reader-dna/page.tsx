import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { ReaderDnaView } from '@/components/dna/ReaderDnaView';

export const metadata: Metadata = { title: 'Reader DNA' };

export default function ReaderDnaPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Your durable reading identity"
        title="Reader DNA"
        description="What ReadVerdict believes about your taste — with the evidence behind every conclusion, and your power to correct it. Confidence is honest; thin evidence says so."
      />
      <ReaderDnaView />
    </div>
  );
}
