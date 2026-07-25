'use client';

import { useState, useTransition } from 'react';
import { requestApproval, decideApproval } from '@/lib/actions/os';

const ACTIONS = [
  { group: 'Needs approval', kinds: ['publish_content','send_outreach','launch_campaign','social_post','production_deploy','customer_comms','change_automation','spend_within_limit'] },
  { group: 'Executive only', kinds: ['pricing_change','contract','destructive_data','major_spend','security_change','legal_commitment','irreversible_migration','product_shutdown','permission_change'] },
];

export function ApprovalRequestForm() {
  const [title, setTitle] = useState('');
  const [actionKind, setActionKind] = useState('publish_content');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      data-testid="approval-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null); setSaved(null);
        start(async () => {
          const res = await requestApproval({ title, actionKind, reason });
          if (res.ok) { setTitle(''); setReason(''); setSaved(`Requested — routed as ${res.data?.tier.replace('_', ' ')}.`); }
          else setError(res.error);
        });
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <h2 className="font-bold text-white">Request approval</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">What are you requesting?</span>
          <input data-testid="approval-title" value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Publish the first 20 movie pages" maxLength={200} />
        </label>
        <label className="block">
          <span className="label">Action</span>
          <select data-testid="approval-action" value={actionKind} onChange={(e) => setActionKind(e.target.value)} className="input">
            {ACTIONS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Reason</span>
          <input data-testid="approval-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="input" placeholder="Why this, and why now?" maxLength={1000} />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-500">The tier is decided by the action, not by you — executive actions always route to a founder.</p>
      {error && <p data-testid="approval-error" role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {saved && <p data-testid="approval-saved" role="status" className="mt-3 text-sm text-emerald-300">{saved}</p>}
      <button type="submit" disabled={pending} className="btn-primary mt-4 px-6">{pending ? 'Submitting…' : 'Submit request'}</button>
    </form>
  );
}

export function DecisionButtons({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: string) => {
    setError(null);
    start(async () => {
      const res = await decideApproval({ id, decision });
      if (!res.ok) setError(res.error);
    });
  };
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button data-testid="approve" disabled={pending} onClick={() => decide('approved')} className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50">Approve</button>
        <button data-testid="reject" disabled={pending} onClick={() => decide('rejected')} className="rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-50">Reject</button>
        <button data-testid="request-changes" disabled={pending} onClick={() => decide('changes_requested')} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50">Request changes</button>
      </div>
      {error && <p data-testid="decision-error" role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
