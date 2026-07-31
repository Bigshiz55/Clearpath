import { redirect } from 'next/navigation';
import { getMergePreview } from '@/lib/actions/mergeAccount';
import { MergeDecision } from '@/components/auth/MergeDecision';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | undefined): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/app';
}

/**
 * Reached only when /auth/callback found real data on BOTH sides (the
 * signed-in account already has its own watchlist, and the browser's
 * anonymous session also had one) — the one case where a merge must ask
 * rather than decide silently. Re-derives the preview fresh (never trusts
 * the query string alone) so a stale or tampered link can't merge/discard
 * anything real.
 */
export default async function AuthMergePage({
  searchParams,
}: {
  searchParams: { anon?: string; next?: string };
}) {
  const next = safeNext(searchParams.next);
  const anonUserId = searchParams.anon ?? '';
  const preview = await getMergePreview(anonUserId);

  // Already resolved (e.g. a reloaded/bookmarked link) or invalid — nothing
  // left to decide, just continue.
  if (!preview || preview.anonItemCount === 0) redirect(next);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <MergeDecision
        anonUserId={preview.anonUserId}
        anonItemCount={preview.anonItemCount}
        targetItemCount={preview.targetItemCount}
        next={next}
      />
    </div>
  );
}
