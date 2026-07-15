import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfile, ensureGuestProfile, personalLabelFor } from '@/lib/profile';
import { Nav } from '@/components/Nav';

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

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <Nav personalLabel={personalLabelFor(profile)} />
      <main className="container-page py-6">{children}</main>
    </div>
  );
}
