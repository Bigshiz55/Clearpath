import type { Metadata } from 'next';
import { AskTheJudge } from '@/components/AskTheJudge';
import { TakeToCourtCard } from '@/components/TakeToCourtCard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ask the Judge · WatchVerd1ct' };

export default async function AskPage({ searchParams }: { searchParams: { q?: string } }) {
  const seed = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 300) : null;

  return (
    /* FULL SHELL WIDTH. The whole page was capped at `max-w-2xl`, which — on
       top of the old in-chat rendering — meant a desktop could never show
       more than a cramped column of results. The conversation card constrains
       ITSELF to reading width; the results grid underneath uses the width the
       shell already provides, so a desktop gets 3–4 tiles per row, a tablet
       2, a phone 1 — the same `.poster-grid` behavior as every other surface. */
    <div>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">⚖️ Ask the Judge</h1>
        <p className="mt-1 text-sm text-slate-400">
          Type what you feel like watching and hit Enter — or tap the mic and speak. The judge reads your case, rules, and shows real titles, each scored for you.
        </p>
      </div>
      <div className="mt-5">
        <AskTheJudge seedQuery={seed} />
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <TakeToCourtCard />
      </div>
    </div>
  );
}
