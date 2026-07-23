import type { Metadata } from 'next';
import { TrialClient } from './TrialClient';

export const metadata: Metadata = { title: 'Book Trial' };

export default function TrialPage({ params }: { params: { workId: string } }) {
  return <TrialClient workId={decodeURIComponent(params.workId)} />;
}
