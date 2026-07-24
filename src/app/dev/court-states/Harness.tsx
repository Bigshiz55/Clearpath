'use client';

import { useEffect, useState } from 'react';
import { CourtErrorCard } from '@/components/court/CourtErrorCard';
import { stateInfo, type CourtState } from '@/lib/court/joinState';
import { buildCourtInviteUrl } from '@/lib/court/inviteUrl';

const STATES: CourtState[] = [
  'room-not-found', 'room-expired', 'room-closed', 'court-already-started', 'room-full',
  'invite-invalid', 'config-missing', 'migration-missing', 'permission-denied',
  'connection-failed', 'unexpected',
];

/**
 * Live Court diagnostics + every classified error state, rendered with the real
 * CourtErrorCard so the recovery UI is Playwright-testable. Also shows the invite-URL
 * diagnostics and the live /api/court/health readout (no secrets).
 */
export function CourtStatesHarness() {
  const [health, setHealth] = useState<unknown>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const invite = buildCourtInviteUrl({ origin, roomId: 'AB12CD34' });

  useEffect(() => {
    fetch('/api/court/health').then((r) => r.json()).then(setHealth).catch(() => setHealth({ error: 'unreachable' }));
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <h1 className="mb-3 text-lg font-black text-white">Court Doctor</h1>

      <section data-testid="court-diagnostics" className="card mb-6 p-4 text-left text-xs text-slate-300">
        <div className="font-bold text-white">Diagnostics</div>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
          <dt className="text-slate-500">Deployment origin</dt><dd className="truncate" data-testid="diag-origin">{origin || '—'}</dd>
          <dt className="text-slate-500">Canonical invite origin</dt><dd className="truncate">{invite.origin ?? '—'}</dd>
          <dt className="text-slate-500">Generated invite URL</dt><dd className="truncate" data-testid="diag-invite">{invite.url ?? '—'}</dd>
          <dt className="text-slate-500">Room ID</dt><dd>{invite.roomId ?? '—'}</dd>
          <dt className="text-slate-500">Shareable</dt><dd>{String(invite.shareable)}</dd>
        </dl>
        <div className="mt-2 font-bold text-white">Health (/api/court/health)</div>
        <pre data-testid="diag-health" className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] text-slate-400">{health ? JSON.stringify(health, null, 2) : 'loading…'}</pre>
      </section>

      <div className="space-y-4">
        {STATES.map((s) => (
          <div key={s} data-testid={`state-${s}`}>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-brand-300">{s}</div>
            <CourtErrorCard err={stateInfo(s)} onRetry={() => {}} />
          </div>
        ))}
      </div>
    </main>
  );
}
