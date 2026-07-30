import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OsShell, OsSetupNotice, EmptyState } from '@/components/os/OsShell';
import { getViewer, loadOsData, osSchemaReady } from '@/lib/os/server';
import { can } from '@/lib/os/permissions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Activity · Verd1ct OS', robots: { index: false, follow: false } };

export default async function ActivityPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/os/activity');
  if (!can(viewer.role, 'audit.view')) {
    return <OsShell viewer={viewer}><EmptyState title="Audit history is restricted" detail={`Your role (${viewer.role ?? 'none'}) cannot view the audit trail.`} /></OsShell>;
  }
  const ready = await osSchemaReady();
  const { activity } = await loadOsData();

  return (
    <OsShell viewer={viewer}>
      <h1 className="text-2xl font-black text-white sm:text-3xl">Activity</h1>
      <p className="mt-1 text-sm text-slate-400">Append-only. Records cannot be edited or deleted, by design.</p>
      {!ready && <div className="mt-6"><OsSetupNotice /></div>}
      <div className="mt-6">
        {activity.length === 0 ? (
          <EmptyState title="No recorded activity yet" detail="Every mission, task and approval change will appear here." />
        ) : (
          <ul className="space-y-2" data-testid="activity-list">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm">
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-brand-200">{a.action}</code>
                <span className="min-w-0 flex-1 text-slate-200">{a.note ?? a.entity_type}</span>
                <span className="text-xs tabular-nums text-slate-500">{a.created_at.replace('T', ' ').slice(0, 16)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OsShell>
  );
}
