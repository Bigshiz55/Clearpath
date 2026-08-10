import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RapidCalibration } from '@/components/voice/calibration/RapidCalibration';

/**
 * VOICE DNA — the 60-second calibration. This is the onboarding experience.
 *
 * It replaced a conversational interview that asked open questions and talked
 * back after every answer. That version worked and nobody wanted to use it: it
 * took minutes, it explained itself, and it made the person do the talking.
 * This one names fifteen kinds of show and asks for a number, which is the
 * fastest honest way to learn a taste baseline.
 *
 * The conversation still exists, one door further in, at `/voice-dna/deep` —
 * reachable from "Fine-tune my DNA" at the end of a calibration. It is a depth
 * option, not the front door.
 *
 * Session model is unchanged: `/voice-dna` is in `PROTECTED_PREFIXES`, so
 * middleware has already minted a guest session by the time this renders. The
 * redirect below is the belt-and-braces case where anonymous sign-ins are
 * disabled and there is nowhere to save answers to.
 *
 * Still `noindex`: an onboarding flow is not a search result.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Voice DNA · WatchVerd1ct',
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
      <RapidCalibration />
    </main>
  );
}
