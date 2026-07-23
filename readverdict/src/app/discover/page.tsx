import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Discover' };

export default function DiscoverPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Discover"
        title="Exploration, editorially shaped"
        description="Not a popularity feed and not an endless grid — curated lenses tuned to your Reader DNA."
      />
      <EmptyState
        phase="Phase 4+"
        title="Discover is being designed"
        body="Discover will offer similarity lenses (same emotional payoff, same prose feeling, same reading commitment, and more) and taste-aware collections. It will never pad a shelf with weak matches to look full."
      />
    </div>
  );
}
