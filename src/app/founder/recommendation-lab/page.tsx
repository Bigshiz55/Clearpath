import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasFounderAccess } from '@/lib/founder/gate';
import { RecoLabClient } from '@/components/reco/RecoLabClient';
import { founderLogout } from '@/lib/actions/founderAccess';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Recommendation lab · founder only',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * FOUNDER-ONLY diagnostic for the hybrid recommendation funnel.
 *
 * Authorization is server-side and happens BEFORE any engine code is imported
 * into the response: an unauthorized visitor gets a 404, not a redirect, so the
 * route's existence is not disclosed. Gating goes through `hasFounderAccess()`,
 * which accepts either a signed temporary founder-code session or a normal
 * ADMIN_EMAILS session — never a client-side check.
 *
 * Nothing here touches the public recommendation path. The engine runs against
 * a deterministic SYNTHETIC catalog with FIXTURE (non-semantic) vectors, and
 * the screen says so continuously.
 */
export default async function RecommendationLabPage() {
  // ONE gate for every founder surface. The page never learns HOW access was
  // proved — a temporary code today, a normal admin session once public
  // sign-in returns — so restoring auth needs no change here.
  if (!(await hasFounderAccess())) notFound();

  // The engine runs in the browser (see RecoLabClient): pure, no I/O, and it
  // keeps a 50,000-title run off the serverless function's memory ceiling.
  return (
    <>
      {/* Logout is a POSTed server action, so it cannot be triggered by a
          third-party GET and it clears the cookie server-side. */}
      <form action={founderLogout} className="fixed right-3 top-16 z-50">
        <button
          type="submit"
          data-testid="founder-logout"
          className="rounded-lg border border-white/15 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-200 backdrop-blur hover:bg-white/10"
        >
          End founder session
        </button>
      </form>
      <RecoLabClient />
    </>
  );
}
