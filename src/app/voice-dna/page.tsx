import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { VoiceInterview } from '@/components/voice/VoiceInterview';

/**
 * VOICE DNA — the founder-only entry to the spoken taste interview.
 *
 * Authorization is server-side and BEFORE the experience renders: identity is
 * verified with `supabase.auth.getUser()` (never `getSession()`), and anyone who
 * is not a configured founder/admin gets the same hidden 404 the other founder
 * surfaces return — the route's existence is not disclosed.
 *
 * The interview itself degrades safely: with no OpenAI key the client runs the
 * keyless browser-speech path, so this page (and `next build`) need no secrets.
 */
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Voice DNA · founder only',
  robots: { index: false, follow: false, nocache: true },
};

export default async function VoiceDnaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isFounderOrAdminEmail(user.email)) notFound();

  return (
    <main className="min-h-screen bg-cinema-radial">
      <VoiceInterview />
    </main>
  );
}
