import type { Metadata } from 'next';
import { voiceInterviewMode, realtimeVoice } from '@/lib/voice/config';
import { AuditionClient } from '@/components/voice/AuditionClient';

/**
 * VOICE AUDITION — preview of the candidate interviewer voices, open to everyone.
 *
 * Publicly accessible (no auth gate). The mode and the currently-configured
 * voice are read from the server-only config here and handed to the client,
 * which never sees a key — with none configured it falls back to browser-voice
 * previews and says so.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Voice audition',
};

export default function VoiceAuditionPage() {
  return (
    <main className="min-h-screen bg-cinema-radial">
      <AuditionClient mode={voiceInterviewMode()} configuredVoice={realtimeVoice()} />
    </main>
  );
}
