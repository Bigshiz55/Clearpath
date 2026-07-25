'use client';

import { useState, useTransition } from 'react';
import { createMission, setMissionStatus } from '@/lib/actions/os';

/** Real create form: persists through a server action, shows real errors. */
export function MissionForm() {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [priority, setPriority] = useState('medium');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await createMission({ title, objective, priority, targetDate });
      if (res.ok) {
        setTitle(''); setObjective(''); setTargetDate('');
        setSaved(true);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} data-testid="mission-form" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="font-bold text-white">New mission</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Title</span>
          <input data-testid="mission-title" value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Launch WatchVerd1ct beta" maxLength={160} />
        </label>
        <label className="block">
          <span className="label">Target date</span>
          <input data-testid="mission-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Objective</span>
          <input data-testid="mission-objective" value={objective} onChange={(e) => setObjective(e.target.value)} className="input" placeholder="What outcome does this mission deliver?" maxLength={600} />
        </label>
        <label className="block">
          <span className="label">Priority</span>
          <select data-testid="mission-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="input">
            {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      {error && <p data-testid="mission-error" role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {saved && <p data-testid="mission-saved" role="status" className="mt-3 text-sm text-emerald-300">Mission created.</p>}
      <button type="submit" disabled={pending} className="btn-primary mt-4 px-6">
        {pending ? 'Creating…' : 'Create mission'}
      </button>
    </form>
  );
}

/** Status control that performs a validated, audited transition. */
export function MissionStatusControl({ id, status }: { id: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const options = ['draft', 'active', 'blocked', 'in_review', 'complete', 'cancelled'];

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        data-testid="mission-status-select"
        defaultValue={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          start(async () => {
            const res = await setMissionStatus({ id, status: next });
            if (!res.ok) setError(res.error);
          });
        }}
        className="rounded-lg border border-white/15 bg-ink-900 px-2 py-1 text-xs text-slate-200"
      >
        {options.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
      </select>
      {error && <span data-testid="mission-status-error" role="alert" className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
