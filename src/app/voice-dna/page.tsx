import type { Metadata } from 'next';
import { audioAvailability } from '@/lib/voicedna/audio';
import { createClient } from '@/lib/supabase/server';
import { VoiceDnaClient } from '@/components/voicedna/VoiceDnaClient';

export const metadata: Metadata = {
  title: 'Verd1ct Voice DNA · WatchVerd1ct',
  description: 'A short conversation about what you actually like, contradictions included.',
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

  return (
    <div className="container-page py-6">
      <VoiceDnaClient audio={audio} canPersist={canPersist} />
    </div>
  );
}
