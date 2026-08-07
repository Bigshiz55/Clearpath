import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { voiceInterviewMode, realtimeVoice } from '@/lib/voice/config';
import { AuditionClient } from '@/components/voice/AuditionClient';

/**
 * VOICE AUDITION — founder-only preview of the candidate interviewer voices.
 *
 * Gated exactly like the Voice DNA page: server-side `getUser()` + founder/admin
 * check, hidden 404 otherwise. The mode and the currently-configured voice are
 * read from the server-only config here and handed to the client, which never
 * sees a key — with none configured it falls back to browser-voice previews and
 * says so.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Voice audition · founder only',
  robots: { index: false, follow: false, nocache: true },
};

export default async function VoiceAuditionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isFounderOrAdminEmail(user.email)) notFound();

  return (
    <main className="min-h-screen bg-cinema-radial">
      <AuditionClient mode={voiceInterviewMode()} configuredVoice={realtimeVoice()} />
    </main>
  );
}
