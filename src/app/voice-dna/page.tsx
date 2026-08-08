import type { Metadata } from 'next';
import { VoiceInterview } from '@/components/voice/VoiceInterview';

/**
 * VOICE DNA — the spoken taste interview, open to everyone.
 *
 * Publicly accessible (no auth gate). A signed-out visitor gets an ephemeral,
 * client-carried interview that is NOT persisted; a signed-in user's interview
 * is saved to their profile by the server actions (unchanged). The interview
 * degrades safely — with no OpenAI key the client runs the keyless
 * browser-speech path, so this page (and `next build`) need no secrets.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Voice DNA',
};

export default function VoiceDnaPage() {
  return (
    <main className="min-h-screen bg-cinema-radial">
      <VoiceInterview />
    </main>
  );
}
