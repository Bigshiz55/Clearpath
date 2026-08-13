import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { ImportPanel } from '@/components/import/ImportPanel';
import { DataControls } from '@/components/profile/DataControls';

export const metadata: Metadata = { title: 'Profile' };

export default function ProfilePage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Profile"
        title="You, and your data"
        description="Import your reading history, tune your Reader DNA, and control your data. No account required to start."
      />

      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="exhibit-label">Import</span>
          <h2 className="font-display text-xl font-semibold text-ivory-50">Import your reading history</h2>
        </div>
        <p className="mb-3 text-sm text-ivory-300">
          Upload an official Goodreads or StoryGraph export, or paste a list. The raw rows are preserved,
          duplicates are flagged, and nothing low-confidence is added silently.
        </p>
        <ImportPanel />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="exhibit-label">Reader DNA</span>
          <h2 className="font-display text-xl font-semibold text-ivory-50">Tune your profile</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/onboarding" className="btn-brass">Take the Reader Interview</Link>
          <Link href="/reader-dna" className="btn-ghost">View Reader DNA</Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <span className="exhibit-label">Privacy</span>
          <h2 className="font-display text-xl font-semibold text-ivory-50">Data &amp; privacy</h2>
        </div>
        <DataControls />
      </section>
    </div>
  );
}
