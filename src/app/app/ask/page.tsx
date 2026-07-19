import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMyServices } from '@/lib/profile';
import { AskTheJudge } from '@/components/AskTheJudge';
import { TakeToCourtCard } from '@/components/TakeToCourtCard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ask the Judge · WatchVerdict' };

export default async function AskPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const services = user ? await getMyServices(supabase, user.id) : [];
  const seed = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 300) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">⚖️ Ask the Judge</h1>
        <p className="mt-1 text-sm text-slate-400">
          Type what you feel like watching and hit Enter — or tap the mic and speak. The judge reads your case, rules, and shows real titles, each scored for you.
        </p>
      </div>
      <div className="mt-5">
        <AskTheJudge hasServices={services.length > 0} seedQuery={seed} />
      </div>

      <div className="mt-6">
        <TakeToCourtCard />
      </div>
    </div>
  );
}
