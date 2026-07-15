import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMyServices } from '@/lib/profile';
import { FinderUI } from '@/components/FinderUI';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Find it · WatchVerdict' };

export default async function FinderPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const services = user ? await getMyServices(supabase, user.id) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">🔎 Find exactly what to watch</h1>
      <p className="mt-2 text-sm text-slate-400">
        Say what you want in plain English — length, genre, how recent, a minimum match, English audio, on your
        services. You get a <span className="font-semibold text-slate-200">ranked set</span> of real titles, each
        scored for you and showing exactly which of your rules it met. No black box, no “one guess,” no credits.
      </p>
      <div className="mt-6">
        <FinderUI hasServices={services.length > 0} />
      </div>
    </div>
  );
}
