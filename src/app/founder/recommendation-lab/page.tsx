import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { RecommendationLab } from '@/components/reco/RecommendationLab';

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
 * route's existence is not disclosed. Gating is the ADMIN_EMAILS env allowlist
 * (`isAdminEmail`), matching every other founder surface — there is no database
 * flag a user could flip to promote themselves.
 *
 * Nothing here touches the public recommendation path. The engine runs against
 * a deterministic SYNTHETIC catalog with FIXTURE (non-semantic) vectors, and
 * the screen says so continuously.
 */
export default async function RecommendationLabPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user || !isAdminEmail(user.email)) notFound();

  return <RecommendationLab />;
}
