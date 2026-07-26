import type { Metadata } from 'next';
import Link from 'next/link';
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
      {/* Public route, outside the gated /app tree — it carries its own way back. */}
      <Link
        href="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-white"
        data-testid="back-to-app"
      >
        <span aria-hidden>←</span> Back to WatchVerd1ct
      </Link>
      <ImportTasteFlow />
    </div>
  );
}
