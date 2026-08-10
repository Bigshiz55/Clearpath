import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VerdictRush } from '@/components/dnagame/VerdictRush';

/**
 * VERD1CT RUSH — the primary onboarding experience.
 *
 * Voice is retired as the front door. It was rebuilt twice and still asked
 * people to talk to their phone, which is a worse trade than tapping: slower,
 * less reliable, and impossible on a train. This is the replacement — a fast
 * visual game that secretly builds the same profile, on the same trait engine
 * the voice work produced. That engine was worth keeping; the interview was not.
 *
 * The spoken interview survives at `/voice-dna/deep` for anyone who wants it,
 * and is never forced on anyone during onboarding.
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
  title: 'Verd1ct Rush · WatchVerd1ct',
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
      <VerdictRush />
    </main>
  );
}
