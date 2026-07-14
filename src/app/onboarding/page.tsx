import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { OnboardingForm } from '@/components/onboarding/OnboardingForm';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/profile';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Get started' };

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');

  const profile = await getProfile(supabase, user.id);
  if (profile?.onboarding_complete) redirect('/app');

  const defaultName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.email ? user.email.split('@')[0] : '') ??
    '';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-8">
        <OnboardingForm defaultName={defaultName} />
      </main>
    </div>
  );
}
