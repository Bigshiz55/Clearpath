import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMyServices } from '@/lib/profile';
import { MoodFinder } from '@/components/MoodFinder';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'What are you in the mood for? · WatchVerdict' };

export default async function MoodPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const services = user ? await getMyServices(supabase, user.id) : [];
  const { t } = getServerI18n();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('ask.moodPage.heading')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('ask.moodPage.intro')}
      </p>
      <div className="mt-6">
        <MoodFinder hasServices={services.length > 0} />
      </div>
    </div>
  );
}
