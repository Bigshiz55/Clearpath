import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { QuickDna } from '@/components/voice/quickdna/QuickDna';

/**
 * VOICE DNA — Quick DNA. The primary onboarding experience.
 *
 * Two products live under this route now, and only one of them is the front
 * door. QUICK DNA is here: press start once, put your hands down, answer out
 * loud for about a minute, and get a profile richer than any form could ask
 * for. DEEP DNA — the open-ended conversation — is at `/voice-dna/deep`,
 * reachable from "Fine-tune my DNA" at the end, for people who want to go
 * further. It is never forced during onboarding.
 *
 * Session model unchanged: `/voice-dna` is in `PROTECTED_PREFIXES`, so
 * middleware has already minted a guest session by the time this renders. The
 * redirect below is the belt-and-braces case where anonymous sign-ins are off
 * and there is nowhere to save answers to.
 *
 * Still `noindex`: an onboarding flow is not a search result.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Quick DNA · WatchVerd1ct',
  robots: { index: false, follow: false, nocache: true },
};

export default async function VoiceDnaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fvoice-dna');

  return (
    <main className="min-h-screen bg-cinema-radial">
      <QuickDna />
    </main>
  );
}
