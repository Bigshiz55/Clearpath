import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/profile';
import { getChambersData } from '@/lib/chambersData';
import { ChambersProfile } from '@/components/chambers/ChambersProfile';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Chambers · WatchVerdict' };

export default async function ChambersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/app/chambers');

  const profile = await getProfile(supabase, user.id);
  const data = await getChambersData(supabase, user.id, Date.now());

  const name =
    profile?.display_name?.trim() ||
    (profile?.username ? `@${profile.username}` : 'Your Chambers');

  return (
    <ChambersProfile
      name={name}
      username={profile?.username ?? null}
      counts={data.counts}
      mix={data.mix}
      topLove={data.topLove}
      loves={data.loves}
      avoids={data.avoids}
      dna={data.dna}
    />
  );
}
