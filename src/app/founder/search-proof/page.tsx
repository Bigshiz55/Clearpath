import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { getBuildInfo } from '@/lib/buildInfo';
import SearchProofClient from './SearchProofClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Production Search Proof',
  robots: { index: false, follow: false },
};

/**
 * FOUNDER-ONLY. One-click proof that the search a user actually invokes
 * (POST /api/finder) is running the deployed build and honoring hard
 * constraints. It exists so nobody has to wonder again whether they were
 * testing production, a preview, a cached tab, or the wrong route: the page
 * loads with the server's build SHA, fires the real authenticated route, and
 * refuses to trust a response whose SHA does not match.
 *
 * No secrets: the page never renders tokens, cookies, user ids, or keys — only
 * the query the server applied and the titles + evidence it returned.
 */
export default async function SearchProofPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const pageSha = getBuildInfo().gitSha || 'unknown';
  return <SearchProofClient pageSha={pageSha} />;
}
