import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/profile';
import { getEasyPicks } from '@/lib/easyPicks';
import { EasyMode } from '@/components/EasyMode';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Easy Mode · WatchVerdict' };

export default async function EasyModePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const profile = user ? await getProfile(supabase, uid) : null;
  const name = profile?.display_name?.trim().split(/\s+/)[0] || null;

  const picks = await getEasyPicks(supabase, uid, 'me');

  return <EasyMode initialPicks={picks} name={name} />;
}
