import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OsShell, OsSetupNotice, EmptyState, StatusChip } from '@/components/os/OsShell';
import { getViewer, loadOsData, osSchemaReady } from '@/lib/os/server';
import { attentionItems, missionProgress } from '@/lib/os/workflow';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Command Center · Verd1ct OS',
  robots: { index: false, follow: false },
};

export default async function CommandCenter() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/os');
  if (!viewer.role) {
    return (
      <OsShell viewer={viewer}>
        <EmptyState
          title="You do not have a Verd1ct OS role"
          detail="Verd1ct OS is restricted to company members. Ask a founder or admin to grant you a role."
        />
      </OsShell>
    );
  }

  const ready = await osSchemaReady();
  const { missions, tasks, approvals, activity } = await loadOsData();
  const now = new Date();

  const attention = attentionItems({
    missions: missions.map((m) => ({ id: m.id, title: m.title, status: m.status, priority: m.priority, targetDate: m.target_date })),
    approvals: approvals.map((a) => ({ id: a.id, title: a.title, status: a.status, tier: a.tier, requestedAt: a.created_at })),
    now,
  });

  const activeMissions = missions.filter((m) => m.status === 'active');
  const pending = approvals.filter((a) => a.status === 'pending');

  return (
    <OsShell viewer={viewer}>
      <h1 className="text-2xl font-black text-white sm:text-3xl">Command Center</h1>
      <p className="mt-1 text-sm text-slate-400">What needs you right now — nothing decorative.</p>

      {!ready && <div className="mt-6"><OsSetupNotice /></div>}

      <section className="mt-6" data-testid="attention">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Needs your attention</h2>
        <div className="mt-3">
          {attention.length === 0 ? (
            <EmptyState
              title="Nothing needs you right now"
              detail="No pending approvals, blocked missions, or work due in the next seven days."
            />
          ) : (
            <ul className="space-y-2">
              {attention.map((i) => (
                <li key={`${i.kind}-${i.id}`}>
                  <Link
                    href={i.href}
                    data-testid="attention-item"
                    data-kind={i.kind}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/25 hover:bg-white/[0.06]"
                  >
                    <span className="min-w-0 font-semibold text-white">{i.label}</span>
                    <span className="text-sm text-slate-400">{i.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3" data-testid="os-counters">
        {[
          { label: 'Active missions', value: activeMissions.length, href: '/os/missions' },
          { label: 'Approvals waiting', value: pending.length, href: '/os/approvals' },
          { label: 'Recorded actions', value: activity.length, href: '/os/activity' },
        ].map((c) => (
          <Link key={c.label} href={c.href} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25">
            <div className="text-3xl font-black tabular-nums text-white">{c.value}</div>
            <div className="mt-1 text-sm text-slate-400">{c.label}</div>
          </Link>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Active missions</h2>
          <Link href="/os/missions" className="text-xs font-semibold text-brand-200 hover:text-white">All missions →</Link>
        </div>
        <div className="mt-3">
          {activeMissions.length === 0 ? (
            <EmptyState title="No active missions" detail="Create a mission to start tracking work here." />
          ) : (
            <ul className="space-y-2">
              {activeMissions.map((m) => {
                const p = missionProgress(tasks.filter((t) => t.mission_id === m.id));
                return (
                  <li key={m.id}>
                    <Link href={`/os/missions/${m.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:border-white/25">
                      <StatusChip status={m.status} />
                      <span className="min-w-0 flex-1 font-semibold text-white">{m.title}</span>
                      <span className="text-sm tabular-nums text-slate-400">{p.done}/{p.total} tasks · {p.percent}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </OsShell>
  );
}
