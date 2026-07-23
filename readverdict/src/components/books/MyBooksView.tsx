'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { USER_BOOK_STATUSES, statusLabel, DNF_REASONS, type UserBookStatus, type DnfReason } from '@/lib/domain/userBook';
import { StatusPill, type BookStatus } from '@/components/ui/StatusPill';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { BookCover } from '@/components/trial/BookCover';
import { AppealDialog } from './AppealDialog';
import { cn } from '@/lib/utils/cn';

const STATUS_DISPLAY: Record<UserBookStatus, BookStatus> = {
  saved: 'Saved',
  interested: 'Interested',
  reading: 'Reading',
  finished: 'Finished',
  dnf: 'DNF',
  paused: 'Paused',
  reread: 'Want to reread',
};

export function MyBooksView() {
  const store = useStore();
  const [filter, setFilter] = useState<UserBookStatus | 'all'>('all');
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const library = store.state.library;

  if (library.length === 0) {
    return (
      <EmptyState
        title="No books yet"
        body="Search for a book and put it on trial, or import your reading history. Every book you act on teaches your Reader DNA."
      >
        <div className="flex justify-center gap-2">
          <Link href="/search" className="btn-brass">Search books</Link>
          <Link href="/profile" className="btn-ghost">Import history</Link>
        </div>
      </EmptyState>
    );
  }

  const filtered = filter === 'all' ? library : library.filter((e) => e.status === filter);
  const counts = library.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${library.length})`} />
        {USER_BOOK_STATUSES.filter((s) => counts[s]).map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={`${statusLabel(s)} (${counts[s]})`} />
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((e) => (
          <Card key={e.id}>
            <div className="flex gap-4 p-4">
              <BookCover url={e.book.coverUrl} title={e.book.title} className="h-24 w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/trial/${encodeURIComponent(e.book.workId)}`} className="font-display text-lg font-semibold text-ivory-50 hover:text-copper-200">
                      {e.book.title}
                    </Link>
                    <p className="truncate text-sm text-ivory-300">{e.book.author ?? 'Unknown author'}</p>
                  </div>
                  <StatusPill status={STATUS_DISPLAY[e.status]} />
                </div>

                {e.status === 'dnf' && e.dnfReason && (
                  <p className="mt-1 text-xs text-oxblood-400">Stopped: {DNF_REASONS[e.dnfReason]}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusSelect
                    value={e.status}
                    onChange={(s) => store.setStatus(e.id, s)}
                  />
                  {(e.status === 'reading' || e.status === 'paused') && (
                    <Button size="sm" variant="secondary" onClick={() => setAppealFor(e.id)}>
                      File an appeal
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => store.removeEntry(e.id)}
                    className="text-xs text-ivory-400 underline-offset-2 hover:text-oxblood-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {appealFor && (
        <AppealDialog
          entryId={appealFor}
          onClose={() => setAppealFor(null)}
        />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-300',
        active ? 'border-copper-500/50 bg-copper-500/10 text-copper-200' : 'border-ink-600 bg-ink-850 text-ivory-200 hover:border-ink-500',
      )}
    >
      {label}
    </button>
  );
}

function StatusSelect({ value, onChange }: { value: UserBookStatus; onChange: (s: UserBookStatus) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-ivory-400">
      <span className="sr-only">Change status</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as UserBookStatus)}
        className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-xs text-ivory-100 focus:border-copper-500 focus:outline-none"
      >
        {USER_BOOK_STATUSES.map((s) => (
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>
    </label>
  );
}

export { DNF_REASONS };
export type { DnfReason };
