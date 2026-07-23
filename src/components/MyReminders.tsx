'use client';

import { useState } from 'react';
import { removeTvReminder } from '@/lib/actions/tvReminders';
import { useI18n } from '@/i18n/I18nProvider';

export interface ReminderRow {
  airingId: number;
  showName: string;
  network: string | null;
  airstamp: string;
}

function whenLabel(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: string,
): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return t('account.reminders.today', { time });
  if (tomorrow) return t('account.reminders.tomorrow', { time });
  const day = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  return t('account.reminders.dateLabel', { day, time });
}

export function MyReminders({ initial }: { initial: ReminderRow[] }) {
  const { t, locale } = useI18n();
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
      <h2 className="mb-1 text-lg font-semibold text-white">{t('account.reminders.heading')}</h2>
      <p className="mb-3 text-xs text-slate-400">{t('account.reminders.notice')}</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.airingId} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{r.showName}</div>
              <div className="truncate text-xs text-slate-300">
                {whenLabel(r.airstamp, t, locale)}{r.network ? ` · ${r.network}` : ''}
              </div>
            </div>
            <button
              onClick={() => cancel(r.airingId)}
              disabled={busy === r.airingId}
              className="flex-none rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              {t('account.reminders.cancel')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
