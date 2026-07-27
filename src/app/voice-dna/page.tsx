import type { Metadata } from 'next';
import Link from 'next/link';
import { audioAvailability } from '@/lib/voicedna/audio';
import { createClient } from '@/lib/supabase/server';
import { VoiceDnaClient } from '@/components/voicedna/VoiceDnaClient';

export const metadata: Metadata = {
  title: 'Witness Testimony · WatchVerd1ct',
  description: 'Ten questions about what you actually like, contradictions included.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function VoiceDnaPage() {
  // `audioAvailability` only reports whether a credential is PRESENT. No secret
  // value crosses this boundary — the returned object is booleans and labels.
  const audio = audioAvailability(process.env);

  let canPersist = false;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    canPersist = Boolean(data.user);
  } catch {
    canPersist = false;
  }

  // This route is deliberately OUTSIDE /app: the interview works signed-out,
  // and /app is gated. So it carries its own way back rather than inheriting
  // the app header — without this the page is a dead end.
  return (
    <div className="container-page pb-6 pt-[calc(env(safe-area-inset-top)+2rem)]">
      <Link
        href="/app"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-white"
        data-testid="back-to-app"
      >
        <span aria-hidden>←</span> Back to WatchVerd1ct
      </Link>
      <VoiceDnaClient audio={audio} canPersist={canPersist} />
    </div>
  );
}
