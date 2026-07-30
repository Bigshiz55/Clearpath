import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OsShell, OsSetupNotice, EmptyState, StatusChip } from '@/components/os/OsShell';
import { ApprovalRequestForm, DecisionButtons } from '@/components/os/ApprovalControls';
import { getViewer, loadOsData, osSchemaReady } from '@/lib/os/server';
import { can, canDecideApproval } from '@/lib/os/permissions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Approvals · Verd1ct OS', robots: { index: false, follow: false } };

export default async function ApprovalsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/os/approvals');
  if (!viewer.role) {
    return <OsShell viewer={viewer}><EmptyState title="No Verd1ct OS role" detail="Ask a founder or admin for access." /></OsShell>;
  }
  const ready = await osSchemaReady();
  const { approvals } = await loadOsData();
  const pending = approvals.filter((a) => a.status === 'pending');
  const decided = approvals.filter((a) => a.status !== 'pending');

  return (
    <OsShell viewer={viewer}>
      <h1 className="text-2xl font-black text-white sm:text-3xl">Approvals</h1>
      <p className="mt-1 text-sm text-slate-400">Every decision is recorded with who asked, who decided and when.</p>

      {!ready && <div className="mt-6"><OsSetupNotice /></div>}

      {can(viewer.role, 'approval.request') && <div className="mt-6"><ApprovalRequestForm /></div>}

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Waiting on a decision</h2>
        <div className="mt-3">
          {pending.length === 0 ? (
            <EmptyState title="Nothing waiting" detail="No requests are pending a decision." />
          ) : (
            <ul className="space-y-3" data-testid="approval-list">
              {pending.map((a) => {
                const verdict = canDecideApproval(viewer.role, a.tier, { requesterId: a.requested_by, deciderId: viewer.userId });
                return (
                  <li key={a.id} id={a.id} data-testid="approval-row" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <StatusChip status={a.status} />
                      <span className="min-w-0 flex-1 font-semibold text-white">{a.title}</span>
                      <span data-testid="approval-tier" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${a.tier === 'executive_only' ? 'border-gold-400/50 bg-gold-500/15 text-gold-200' : 'border-white/15 bg-white/5 text-slate-300'}`}>
                        {a.tier.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{a.action_kind.replace(/_/g, ' ')} · risk {a.risk_level} · raised {a.created_at.slice(0, 10)}</p>
                    {a.reason && <p className="mt-1.5 text-sm text-slate-300">{a.reason}</p>}
                    {verdict.allowed ? (
                      <DecisionButtons id={a.id} />
                    ) : (
                      <p data-testid="decision-blocked" className="mt-3 text-xs text-amber-200">{verdict.reason}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {decided.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Decided</h2>
          <ul className="mt-3 space-y-2" data-testid="decided-list">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
                <StatusChip status={a.status} />
                <span className="min-w-0 flex-1 text-slate-200">{a.title}</span>
                <span className="text-xs text-slate-500">{a.decided_at ? `decided ${a.decided_at.slice(0, 10)}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </OsShell>
  );
}
