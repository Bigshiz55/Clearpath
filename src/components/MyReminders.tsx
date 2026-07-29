'use client';

import { dayLabel } from '@/lib/viewing/localDay';
import { useState } from 'react';
import { removeTvReminder } from '@/lib/actions/tvReminders';

export interface ReminderRow {
  airingId: number;
  showName: string;
  network: string | null;
  airstamp: string;
}

/** Day + clock, in the viewer's zone; the day word from the shared, DST-safe
 *  `localDay` module. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel(iso, Date.now())} ${time}`;
}

export function MyReminders({ initial }: { initial: ReminderRow[] }) {
  const [rows, setRows] = useState<ReminderRow[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function cancel(airingId: number) {
    setBusy(airingId);
    try {
      await removeTvReminder(airingId);
      setRows((r) => r.filter((x) => x.airingId !== airingId));
    } catch {
      /* leave it; user can retry */
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) return null;

  return (
    <section className="card p-4">
      <h2 className="mb-1 text-lg font-semibold text-white">🔔 Your reminders</h2>
      <p className="mb-3 text-xs text-slate-400">We’ll notify you 1 hour and 5 minutes before each one starts.</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.airingId} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{r.showName}</div>
              <div className="truncate text-xs text-slate-300">
                {whenLabel(r.airstamp)}{r.network ? ` · ${r.network}` : ''}
              </div>
            </div>
            <button
              onClick={() => cancel(r.airingId)}
              disabled={busy === r.airingId}
              className="flex-none rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
