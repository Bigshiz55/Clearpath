import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listDecisionRuns } from '@/lib/graph/store';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER DECISION-RUN INSPECTOR — the list. Admin-gated by the Growth OS
 * layout (non-admins 404 before this renders). RLS additionally scopes reads
 * to the signed-in account's own runs: the founder reproduces a defect with
 * their own session and reads their own trace. A production failure becomes
 * understandable in seconds instead of a log archaeology session.
 */
export default async function DecisionRunsPage() {
  const supabase = createClient();
  const runs = await listDecisionRuns(supabase, 50);
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-black text-white">Decision runs</h1>
      <p className="mt-1 text-sm text-slate-400">
        Execution evidence for this account&rsquo;s recent decisions — newest first. Reproduce a
        defect with this signed-in session, then open its run.
      </p>
      {runs.length === 0 ? (
        <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          No runs recorded yet. Submit something through State Your Case or Ask with this
          account, then refresh. (On deployments predating migration 0047 the store degrades
          to a no-op — this page will say so by staying empty.)
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.03]">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/growth-os/decisions/${r.id}`} className="flex items-baseline gap-3 px-4 py-3 hover:bg-white/[0.06]">
                <span className="w-24 flex-none text-[11px] font-bold uppercase tracking-wide text-slate-400">{r.entryPoint}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{r.rawText}</span>
                <span className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-black ${r.intent.persistence === 'request_only' ? 'bg-sky-500/20 text-sky-200' : r.intent.persistence === 'durable' ? 'bg-pink-500/20 text-pink-200' : 'bg-white/10 text-slate-300'}`}>
                  {r.intent.kind} · {r.intent.persistence}
                </span>
                <span className="flex-none text-[11px] tabular-nums text-slate-500">{new Date(r.createdAt).toISOString().slice(5, 16).replace('T', ' ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
