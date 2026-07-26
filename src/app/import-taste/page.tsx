import type { Metadata } from 'next';
import { ImportTasteFlow } from '@/components/import/ImportTasteFlow';

export const metadata: Metadata = {
  title: 'Bring Your Taste With You · WatchVerd1ct',
  description: 'Import what you have watched, saved, liked, or skipped so WatchVerd1ct can understand you faster.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function ImportTastePage() {
  return (
    <div className="container-page py-6">
      <ImportTasteFlow />
    </div>
  );
}
