import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VoiceInterview } from '@/components/voice/VoiceInterview';

/**
 * VOICE DNA — the spoken taste interview. A NORMAL product surface.
 *
 * This was founder-gated behind a hidden 404 while the feature was being built.
 * It is not any more: the interview is the fastest way a new person can get a
 * usable Watch DNA, so it uses the same session model as the Taste Quiz —
 * signed in, or an anonymous guest minted by middleware ("no account needed to
 * explore"). Founder gating remains only on the diagnostic surface next door,
 * `/voice-dna/audition`, which exists to compare vendor voices.
 *
 * `/voice-dna` is in `PROTECTED_PREFIXES`, so by the time this renders a session
 * exists. The redirect below is the belt-and-braces case where anonymous
 * sign-ins are disabled on the Supabase project and middleware sent the user to
 * login instead — we send them the same way rather than rendering an interview
 * with nowhere to save its answers.
 *
 * Still `noindex`: a half-finished interview is not a search result.
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
      <VoiceInterview />
    </main>
  );
}
