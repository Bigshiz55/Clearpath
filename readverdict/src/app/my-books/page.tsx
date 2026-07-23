import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill, type BookStatus } from '@/components/ui/StatusPill';

export const metadata: Metadata = { title: 'My Books' };

const STATUSES: BookStatus[] = [
  'Saved',
  'Interested',
  'Reading',
  'Finished',
  'DNF',
  'Paused',
  'Want to reread',
];

export default function MyBooksPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="My Books"
        title="Your shelves, and what they teach"
        description="Track every book across its lifecycle — and let ReadVerdict learn from finishes, DNFs, and rereads."
      />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </div>

      <EmptyState
        phase="Phase 6"
        title="My Books needs an account"
        body="Shelves, filtering, sorting, grid/list views, series grouping, notes, ratings, DNF reasons, and completion dates arrive with Supabase auth in Phase 5–6. DNF reasons are kept separate from durable dislikes so one bad match never blacklists a whole genre."
      />
    </div>
  );
}
