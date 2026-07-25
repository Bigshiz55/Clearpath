import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OsShell, OsSetupNotice, EmptyState, StatusChip } from '@/components/os/OsShell';
import { MissionForm, MissionStatusControl } from '@/components/os/MissionForm';
import { getViewer, loadOsData, osSchemaReady } from '@/lib/os/server';
import { missionProgress } from '@/lib/os/workflow';
import { can } from '@/lib/os/permissions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Missions · Verd1ct OS', robots: { index: false, follow: false } };

export default async function MissionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/os/missions');
  if (!viewer.role) {
    return <OsShell viewer={viewer}><EmptyState title="No Verd1ct OS role" detail="Ask a founder or admin for access." /></OsShell>;
  }
  const ready = await osSchemaReady();
  const { missions, tasks } = await loadOsData();

  return (
    <OsShell viewer={viewer}>
      <h1 className="text-2xl font-black text-white sm:text-3xl">Missions</h1>
      <p className="mt-1 text-sm text-slate-400">Work organised around outcomes, not chats.</p>

      {!ready && <div className="mt-6"><OsSetupNotice /></div>}

      {can(viewer.role, 'mission.create') ? (
        <div className="mt-6"><MissionForm /></div>
      ) : (
        <p data-testid="mission-create-denied" className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          Your role ({viewer.role}) can view missions but not create them.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">All missions</h2>
        <div className="mt-3">
          {missions.length === 0 ? (
            <EmptyState title="No missions yet" detail={ready ? 'Create the first mission above.' : 'The database is not set up, so this list is genuinely empty.'} />
          ) : (
            <ul className="space-y-2" data-testid="mission-list">
              {missions.map((m) => {
                const p = missionProgress(tasks.filter((t) => t.mission_id === m.id));
                return (
                  <li key={m.id} data-testid="mission-row" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <StatusChip status={m.status} />
                      <Link href={`/os/missions/${m.id}`} className="min-w-0 flex-1 font-semibold text-white hover:text-brand-200">{m.title}</Link>
                      <span className="text-xs uppercase tracking-wide text-slate-500">{m.priority}</span>
                      <span className="text-sm tabular-nums text-slate-400">{p.done}/{p.total}</span>
                      {can(viewer.role, 'mission.edit') && <MissionStatusControl id={m.id} status={m.status} />}
                    </div>
                    {m.objective && <p className="mt-1.5 text-sm text-slate-400">{m.objective}</p>}
                    {m.target_date && <p className="mt-1 text-xs text-slate-500">Target {m.target_date}</p>}
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
