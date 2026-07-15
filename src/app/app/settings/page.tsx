import { createClient } from '@/lib/supabase/server';
import { getProfile, getPreferenceRules, personalLabelFor, getMyServices, getPublicActivity } from '@/lib/profile';
import { SettingsView, type ShareRow } from '@/components/settings/SettingsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const [profile, rules, sharesRes, myServices, publicActivity] = await Promise.all([
    getProfile(supabase, uid),
    getPreferenceRules(supabase, uid),
    supabase
      .from('shares')
      .select('token, kind, is_active, expires_at, created_at, snapshot')
      .eq('user_id', uid)
      .order('created_at', { ascending: false }),
    getMyServices(supabase, uid),
    getPublicActivity(supabase, uid),
  ]);

  const shares: ShareRow[] = ((sharesRes.data as Array<Record<string, unknown>> | null) ?? []).map((s) => ({
    token: s.token as string,
    kind: s.kind as string,
    isActive: s.is_active as boolean,
    expiresAt: (s.expires_at as string | null) ?? null,
    createdAt: s.created_at as string,
    title: ((s.snapshot as { title?: string } | null)?.title) ?? 'Shared verdict',
  }));

  return (
    <SettingsView
      email={user?.email ?? ''}
      displayName={profile?.display_name ?? ''}
      username={profile?.username ?? ''}
      region={profile?.region ?? 'US'}
      personalLabel={profile ? personalLabelFor(profile) : 'My Match'}
      dailyDigest={profile?.daily_digest ?? true}
      digestMinScore={profile?.digest_min_score ?? 72}
      rules={rules}
      shares={shares}
      myServices={myServices}
      publicActivity={publicActivity}
    />
  );
}
