'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { performMerge, discardAnonymousData } from '@/lib/actions/mergeAccount';
import { useToast } from '@/components/Toast';

export function MergeDecision({
  anonUserId,
  anonItemCount,
  targetItemCount,
  next,
}: {
  anonUserId: string;
  anonItemCount: number;
  targetItemCount: number;
  next: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'merge' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(decision: 'merge' | 'discard') {
    setBusy(decision);
    setError(null);
    const result = decision === 'merge' ? await performMerge(anonUserId) : await discardAnonymousData(anonUserId);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong.');
      setBusy(null);
      return;
    }
    toast.show(
      decision === 'merge' ? 'Merged — everything is in one account now.' : 'Kept your account as it was.',
      'success',
    );
    router.push(next);
    router.refresh();
  }

  return (
    <div className="card w-full p-6">
      <h1 className="text-xl font-bold text-white">Two watchlists, one account</h1>
      <p className="mt-2 text-sm text-slate-400">
        This account already has <span className="text-slate-200">{targetItemCount}</span> saved title
        {targetItemCount === 1 ? '' : 's'}. This browser also has{' '}
        <span className="text-slate-200">{anonItemCount}</span> title{anonItemCount === 1 ? '' : 's'} saved
        anonymously, before you signed in.
      </p>
      <p className="mt-2 text-sm text-slate-400">Merge them together, or discard the anonymous ones and keep this account exactly as it was?</p>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <div className="mt-5 flex flex-col gap-2">
        <button onClick={() => choose('merge')} disabled={busy !== null} className="btn-primary w-full">
          {busy === 'merge' ? 'Merging…' : `Merge both (${targetItemCount + anonItemCount} total)`}
        </button>
        <button onClick={() => choose('discard')} disabled={busy !== null} className="btn-ghost w-full">
          {busy === 'discard' ? 'Discarding…' : 'Discard the anonymous data, keep this account as is'}
        </button>
      </div>
    </div>
  );
}
