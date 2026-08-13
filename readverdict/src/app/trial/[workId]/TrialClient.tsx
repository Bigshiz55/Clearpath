'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getBookByWorkId } from '@/app/actions/books';
import { trialFromRef } from '@/lib/trial/fromRef';
import { useStore } from '@/lib/store/StoreProvider';
import { TrialView } from '@/components/trial/TrialView';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { profileStrength } from '@/lib/domain/readerDna';
import type { BookRef } from '@/lib/store/types';

export function TrialClient({ workId }: { workId: string }) {
  const store = useStore();
  const [ref, setRef] = useState<BookRef | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  // Stable "now" so the trial doesn't re-generate on every render.
  const now = useRef(new Date().toISOString()).current;

  useEffect(() => {
    let alive = true;
    // Prefer a copy already in the library (offline-friendly), else fetch.
    const cached = store.state.library.find((e) => e.book.workId === workId)?.book;
    if (cached) {
      setRef(cached);
      setState('ready');
      return;
    }
    getBookByWorkId(workId)
      .then((r) => {
        if (!alive) return;
        setRef(r);
        setState(r ? 'ready' : 'notfound');
      })
      .catch(() => alive && setState('notfound'));
    return () => {
      alive = false;
    };
  }, [workId, store.state.library]);

  const trial = useMemo(
    () => (ref ? trialFromRef(ref, store.state.readerDna, now) : null),
    [ref, store.state.readerDna, now],
  );

  useEffect(() => {
    if (trial) store.track('trial_opened', { workId, matchScore: trial.verdict.matchScore });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial?.docket]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="Convening the court…" />
      </div>
    );
  }
  if (state === 'notfound' || !trial || !ref) {
    return (
      <EmptyState
        title="No book found for this case"
        body="We couldn’t resolve that book. Search for it and open a fresh trial."
      >
        <Link href="/search" className="btn-brass">Search books</Link>
      </EmptyState>
    );
  }

  const thin = profileStrength(store.state.readerDna) < 0.15;

  return (
    <>
      {thin && (
        <div className="mb-4 rounded-lg border border-gold-400/40 bg-gold-400/5 px-4 py-3 text-sm text-ivory-200">
          Your Reader DNA is still thin, so this verdict is low-confidence.{' '}
          <Link href="/onboarding" className="link-quiet">Take the 60-second interview</Link> to sharpen it.
        </div>
      )}
      <TrialView trial={trial} bookRef={ref} />
    </>
  );
}
