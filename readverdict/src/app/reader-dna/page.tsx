import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Reader DNA' };

const DIMENSIONS = [
  'Plot intensity',
  'Character depth',
  'Pacing',
  'Prose complexity',
  'Emotional intensity',
  'Darkness',
  'Humor',
  'Romance',
  'Mystery',
  'Worldbuilding',
  'Realism',
  'Series commitment',
  'Reading length',
  'Audiobook affinity',
  'Attention requirement',
];

export default function ReaderDnaPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Reader DNA"
        title="Your durable reading identity"
        description="A distinctive, adjustable profile built from real signals — with confidence per dimension, and evidence you can inspect. It never shows false confidence from a small sample."
      />

      <div className="flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => (
          <span key={d} className="pill">
            {d}
          </span>
        ))}
      </div>

      <EmptyState
        phase="Phase 5"
        title="Reader DNA is modeled, not yet populated"
        body="Explicit vs inferred preferences, confidence by dimension, manual adjustments, and a shareable Reader DNA card arrive in Phase 5. One click is never treated as a permanent preference."
      />
    </div>
  );
}
