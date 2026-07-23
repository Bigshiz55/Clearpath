import { createClient } from '@/lib/supabase/server';
import { getProfile, getPreferenceRules, personalLabelFor, getMyServices, getPublicActivity, getAvatar, regionFor } from '@/lib/profile';
import { isPro } from '@/lib/pro';
import { getBrowseProviders } from '@/lib/browse';
import { isAdminEmail } from '@/lib/admin';
import { SettingsView, type ShareRow } from '@/components/settings/SettingsView';
import { AvatarPicker } from '@/components/AvatarPicker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const [profile, rules, sharesRes, myServices, publicActivity, avatar, pro] = await Promise.all([
    getProfile(supabase, uid),
    getPreferenceRules(supabase, uid),
    supabase
      .from('shares')
      .select('token, kind, is_active, expires_at, created_at, snapshot')
      .eq('user_id', uid)
      .order('created_at', { ascending: false }),
    getMyServices(supabase, uid),
    getPublicActivity(supabase, uid),
    getAvatar(supabase, uid),
    uid ? isPro(supabase, uid) : Promise.resolve(false),
  ]);
  const avatarInitial = (user?.email?.[0] ?? '🍿').toUpperCase();

  // The full region provider catalog (real TMDB ids + names) so the services
  // picker can be searched and is genuinely extensive — not a hardcoded 15.
  const providerCatalog = (await getBrowseProviders(regionFor(profile)).catch(() => [])).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const shares: ShareRow[] = ((sharesRes.data as Array<Record<string, unknown>> | null) ?? []).map((s) => ({
    token: s.token as string,
    kind: s.kind as string,
    isActive: s.is_active as boolean,
    expiresAt: (s.expires_at as string | null) ?? null,
    createdAt: s.created_at as string,
    title: ((s.snapshot as { title?: string } | null)?.title) ?? 'Shared verdict',
  }));

  const { t } = getServerI18n();

  return (
    <div className="space-y-6">
      <AvatarPicker current={avatar} initial={avatarInitial} pro={pro} />

      <section className="card p-4 sm:p-5">
        <div className="eyebrow mb-3">🌐 {t('common.languageRegion')}</div>
        <div className="max-w-sm">
          <LanguageSwitcher />
        </div>
      </section>

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
        providerCatalog={providerCatalog}
        publicActivity={publicActivity}
        isAdmin={isAdminEmail(user?.email)}
      />
    </div>
  );
}
