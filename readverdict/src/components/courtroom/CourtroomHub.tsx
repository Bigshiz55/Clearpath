'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store/StoreProvider';
import { profileStrength } from '@/lib/domain/readerDna';
import { Card } from '@/components/ui/Card';
import { BookCover } from '@/components/trial/BookCover';

const SHELVES = [
  { q: 'thriller', label: 'Try this tonight', hint: 'Fast, finishable picks' },
  { q: 'mystery', label: 'Best next mystery', hint: 'Puzzle-forward reads' },
  { q: 'science fiction', label: 'Worth the commitment', hint: 'Bigger worlds' },
  { q: 'literary fiction', label: 'Slow down with something literary', hint: 'For a patient mood' },
];

export function CourtroomHub() {
  const store = useStore();
  const strength = Math.round(profileStrength(store.state.readerDna) * 100);
  const recent = store.state.library.slice(0, 4);

  return (
    <div className="space-y-8">
      {strength < 15 && (
        <Card padding="lg" className="paper-grain">
          <p className="font-display text-lg text-ivory-50">Empanel your jury first.</p>
          <p className="mt-1 text-sm text-ivory-300">
            A 60-second interview lets ReadVerdict argue your case with confidence.
          </p>
          <Link href="/onboarding" className="btn-brass mt-4">Take the Reader Interview</Link>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-ivory-50">Open a case</h2>
        <Card padding="lg">
          <p className="text-sm text-ivory-300">Search any book and put it on trial.</p>
          <Link href="/search" className="btn-brass mt-3">Search books</Link>
        </Card>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-ivory-50">Recent cases</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((e) => (
              <Link
                key={e.id}
                href={`/trial/${encodeURIComponent(e.book.workId)}`}
                className="card flex items-center gap-3 p-3 transition hover:border-copper-500/50"
              >
                <BookCover url={e.book.coverUrl} title={e.book.title} className="h-16 w-11 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ivory-100">{e.book.title}</p>
                  <p className="truncate text-xs text-ivory-400">{e.book.author ?? 'Unknown'}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold text-ivory-50">Decision shelves</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SHELVES.map((s) => (
            <Link
              key={s.q}
              href={`/search?q=${encodeURIComponent(s.q)}`}
              className="card p-5 transition hover:border-copper-500/50"
            >
              <p className="font-display text-lg font-semibold text-ivory-50">{s.label}</p>
              <p className="mt-1 text-sm text-ivory-300">{s.hint}</p>
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-ivory-400">
          Decision shelves currently seed a search; personalized ranking arrives as your Reader DNA grows.
        </p>
      </section>
    </div>
  );
}
