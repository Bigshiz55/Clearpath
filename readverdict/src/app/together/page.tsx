import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Read Together' };

const MODES = [
  { title: 'Live Book Court', body: 'A temporary session to decide a book right now.' },
  { title: 'Synced Book Club', body: 'A persistent group with shared history and preferences.' },
  { title: 'Private on-device group', body: 'A local decision with no cloud persistence.' },
];

export default function TogetherPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Read Together"
        title="Decide as a group, fairly"
        description="Group decisions are not an average. Hard-nos apply before ranking, and nobody's private exclusion is ever revealed."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {MODES.map((m) => (
          <div key={m.title} className="card p-5">
            <h3 className="font-display text-lg font-semibold text-ivory-50">{m.title}</h3>
            <p className="mt-2 text-sm text-ivory-300">{m.body}</p>
          </div>
        ))}
      </div>

      <EmptyState
        phase="Phase 7"
        title="Group decision tools coming"
        body="QR/link joining, guest participation, private preferences and exclusions, format and commitment compatibility, and a group verdict that optimizes lowest-participant satisfaction and probability of completion — not a bare average."
      />
    </div>
  );
}
