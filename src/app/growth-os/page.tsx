import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { realUserCount, realFunnel, prospectStats, trackedLinkCount } from '@/lib/growth/data';
import {
  stageForUsers, stageInfo, nextMilestone, buildFunnel, biggestLeak, sampleConfidence,
  type GrowthStage,
} from '@/lib/growth/core';
import { todaysPlan } from '@/lib/growth/playbook';

export const dynamic = 'force-dynamic';

export default async function GrowthHome() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [users, funnelCounts, pros, links] = await Promise.all([
    realUserCount(),
    realFunnel(),
    prospectStats(supabase, today),
    trackedLinkCount(supabase),
  ]);

  let override: GrowthStage | null = null;
  try {
    const { data } = await supabase.from('growth_settings').select('stage_override').maybeSingle();
    const so = data?.stage_override;
    if (so === 'stage1' || so === 'stage2' || so === 'stage3' || so === 'scale') override = so;
  } catch { override = null; }
  const stage = override ? stageInfo(override) : stageForUsers(users);
  const milestone = nextMilestone(users);
  const funnel = buildFunnel(funnelCounts);
  const leakRow = biggestLeak(funnel);
  const conf = sampleConfidence(users);

  // Biggest-leak context for the plan (only when it's a meaningful drop).
  let leakCtx: { fromLabel: string; toLabel: string; lostPct: number } | null = null;
  if (leakRow && leakRow.rate != null) {
    const tracked = funnel.filter((r) => !r.untracked);
    const idx = tracked.findIndex((r) => r.step === leakRow.step);
    const from = idx > 0 ? tracked[idx - 1]!.label : 'Previous step';
    leakCtx = { fromLabel: from, toLabel: leakRow.label, lostPct: 1 - leakRow.rate };
  }

  const plan = todaysPlan({
    users, stage: stage.stage,
    prospectsTotal: pros.total, prospectsToContact: pros.toContact, followUpsDue: pros.followUpsDue,
    trackedLinks: links, biggestLeak: leakCtx,
  });

  const activated = funnelCounts.dna_completed;
  const activationPct = activated != null && users > 0 ? Math.round((activated / users) * 100) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black text-white">Good to see you 👋</h1>
        <p className="mt-1 text-sm text-slate-400">
          {stage.label} · {stage.range}{override ? ' (manual)' : ''}. {conf.note}
        </p>
      </header>

      {!pros.tablesReady && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          One-time setup: the Growth OS tables aren’t in the database yet. Apply migration <code>0039_growth_os</code> at{' '}
          <Link href="/migrate" className="underline">/migrate</Link> to enable prospects, campaigns, links, and feedback.
          Your user count and funnel below are live regardless.
        </div>
      )}

      {/* THE prominent section: Today's Growth Plan */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-300">Today’s growth plan</h2>
        <ol className="space-y-2.5">
          {plan.map((a, i) => (
            <li key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-start gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-xs font-bold text-indigo-300">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{a.task}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{a.why}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">💥 {a.impact}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">⏱ {a.minutes} min</span>
                    {a.channel && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{a.channel}</span>}
                  </div>
                  {a.copy && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-indigo-300">Show ready-to-use copy</summary>
                      <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-900 p-2.5 text-[11px] leading-relaxed text-slate-200">{a.copy}</pre>
                    </details>
                  )}
                  <Link href={a.href} className="mt-2 inline-flex rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400">
                    Do it →
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* The five questions */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Real users" value={String(users)} sub={conf.level === 'none' ? 'None yet — start with today’s plan' : `${stage.range}`} />
        <Stat label="Using it (DNA done)" value={activationPct != null ? `${activationPct}%` : '—'} sub={activated != null ? `${activated} activated` : 'not tracked yet'} />
        <Stat label="Where from" value={links > 0 ? `${links} link${links > 1 ? 's' : ''}` : '—'} sub={links > 0 ? 'tracked links live' : 'create a tracked link'} href="/growth-os/campaigns" />
        <Stat label="Inviting others" value="—" sub="referral loop → Phase 2" href="/growth-os/campaigns" />
      </section>

      {/* Milestone */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-white">Next milestone: {milestone.target} users</span>
          <span className="text-slate-400">{milestone.reached ? 'reached 🎉' : `${milestone.remaining} to go`}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-indigo-400 transition-all" style={{ width: `${Math.round(milestone.progress * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">Focus this stage: {stage.focus}</p>
      </section>

      {/* Funnel — real counts, untracked steps labeled honestly */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-300">Activation funnel</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {funnel.map((r) => (
            <div key={r.step} className="flex items-center justify-between border-b border-white/5 px-3.5 py-2 text-sm last:border-0">
              <span className="text-slate-300">{r.label}</span>
              <span className="flex items-center gap-3">
                {r.rate != null && <span className="text-[11px] text-slate-500">{Math.round(r.rate * 100)}%</span>}
                <span className={r.untracked ? 'text-xs text-slate-600' : 'font-bold text-white'}>
                  {r.untracked ? '— not tracked yet' : r.count}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Visitor/return/invite steps need client analytics (Phase 2). Counts shown are real; blanks are honestly untracked, never zeroed.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}
