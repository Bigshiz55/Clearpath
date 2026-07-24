import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile, ensureGuestProfile, personalLabelFor, getAvatar } from '@/lib/profile';
import { isPro } from '@/lib/pro';
import { Nav } from '@/components/Nav';
import { NavArrows } from '@/components/NavArrows';
import { BuildBadge } from '@/components/BuildBadge';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Resolve the verified user. Any configuration/auth failure is treated as
  // "not signed in" and sent to login (never a 500).
  let user = null;
  let supabase;
  try {
    supabase = createClient();
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  } catch {
    user = null;
  }

  if (!user || !supabase) redirect('/login?next=/app');

  const isGuest = user.is_anonymous === true;
  let profile = await getProfile(supabase, user.id);
  if (!profile && isGuest) {
    // Guests get a default profile and skip onboarding entirely.
    profile = await ensureGuestProfile(supabase, user.id);
  }
  if (!profile || (!profile.onboarding_complete && !isGuest)) {
    redirect('/onboarding');
  }

  const pro = isGuest ? false : await isPro(supabase, user.id);
  const avatar = isGuest ? null : await getAvatar(supabase, user.id);
  const avatarLabel = avatar ?? (user.email?.[0] ?? '🍿').toUpperCase();

  // Build marker — read at request time (force-dynamic), so it always shows the
  // commit/branch of the deployment actually serving this page. If your phone
  // shows an old hash, the deploy hasn't been promoted to production.
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev';
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? '';

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <Nav personalLabel={personalLabelFor(profile)} isGuest={isGuest} pro={pro} avatarLabel={avatarLabel} />
      <main className="container-page py-6">
        <NavArrows />
        {children}
        <BuildBadge sha={sha} branch={ref} />
      </main>
    </div>
  );
}
