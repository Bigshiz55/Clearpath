import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile, ensureGuestProfile, personalLabelFor, getAvatar } from '@/lib/profile';
import { isPro } from '@/lib/pro';
import { Nav } from '@/components/Nav';
import { NavArrows } from '@/components/NavArrows';
import { DocketTray } from '@/components/DocketTray';

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

  return (
    <div className="min-h-dvh pb-24 lg:pb-0">
      <Nav personalLabel={personalLabelFor(profile)} isGuest={isGuest} pro={pro} avatarLabel={avatarLabel} />
      <main className="container-page py-6">
        <NavArrows />
        {children}
      </main>
      {/* The docket, wherever you are. Renders nothing when it is empty. */}
      <DocketTray />
    </div>
  );
}
