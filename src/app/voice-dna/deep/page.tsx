import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoiceInterview } from '@/components/voice/VoiceInterview';

/**
 * VOICE DNA — the DEEP interview. Not the onboarding experience.
 *
 * The open-ended conversation, kept as a DEPTH option behind "Fine-tune my
 * DNA" at the end of the 60-second calibration at `/voice-dna`. It is not the
 * front door any more, and deliberately so: it asks open questions and responds
 * to each answer, which is the right shape for someone who has already decided
 * they want to go deeper and entirely the wrong shape for onboarding.
 *
 * Same session model as the calibration — signed in, or an anonymous guest
 * minted by middleware. Founder gating remains only on the diagnostic surface
 * next door, `/voice-dna/audition`, which exists to compare vendor voices.
 *
 * `/voice-dna` (and everything under it) is in `PROTECTED_PREFIXES`, so by the time this renders a session
 * exists. The redirect below is the belt-and-braces case where anonymous
 * sign-ins are disabled on the Supabase project and middleware sent the user to
 * login instead — we send them the same way rather than rendering an interview
 * with nowhere to save its answers.
 *
 * Still `noindex`: a half-finished interview is not a search result.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Fine-tune your DNA · WatchVerd1ct',
  robots: { index: false, follow: false, nocache: true },
};

export default async function VoiceDnaDeepPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fvoice-dna%2Fdeep');

  return (
    <main className="min-h-screen bg-cinema-radial">
      <VoiceInterview />
    </main>
  );
}
