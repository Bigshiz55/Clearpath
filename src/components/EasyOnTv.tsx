'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { setTvReminder, removeTvReminder } from '@/lib/actions/tvReminders';
import { useT } from '@/i18n/I18nProvider';

interface Airing {
  id: number;
  showName: string;
  network: string | null;
  airstamp: string;
  rating: number | null;
  image: string | null;
  showType: string;
  episodeName: string | null;
}

function whenLabel(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return t('misc.onTv.today', { time });
  if (new Date(now.getTime() + 86_400_000).toDateString() === d.toDateString()) return t('misc.onTv.tomorrow', { time });
  return t('misc.onTv.dayTime', { day: d.toLocaleDateString([], { weekday: 'long' }), time });
}

export function EasyOnTv() {
  const t = useT();
  const [airings, setAirings] = useState<Airing[] | null>(null);
  const [reminded, setReminded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeSettings, setNoticeSettings] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/easy-tv')
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setAirings(d.airings ?? []);
        setReminded(new Set((d.remindedIds ?? []) as number[]));
      })
      .catch(() => active && setAirings([]));
    return () => {
      active = false;
    };
  }, []);

  async function toggle(a: Airing) {
    setBusy(a.id);
    try {
      if (reminded.has(a.id)) {
        await removeTvReminder(a.id);
        setReminded((s) => {
          const n = new Set(s);
          n.delete(a.id);
          return n;
        });
      } else {
        const res = await setTvReminder({ airingId: a.id, showName: a.showName, network: a.network, airstamp: a.airstamp, url: '/app/tv' });
        if (!res.ok) {
          setNoticeSettings(false);
          setNotice(res.error ?? t('misc.onTv.couldNotSet'));
          return;
        }
        setReminded((s) => new Set(s).add(a.id));
        setNoticeSettings(!!res.needsNotifications);
        setNotice(res.needsNotifications ? t('misc.onTv.reminderSetNotif') : t('misc.onTv.reminderSet'));
      }
    } catch {
      setNoticeSettings(false);
      setNotice(t('misc.onTv.wentWrong'));
    } finally {
      setBusy(null);
    }
  }

  if (airings === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-300">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
        <span className="text-lg">{t('misc.onTv.checking')}</span>
      </div>
    );
  }

  if (airings.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-white/15 bg-white/5 p-6 text-center">
        <div className="text-3xl">📺</div>
        <p className="mt-2 text-xl text-slate-200">{t('misc.onTv.nothingUp')}</p>
        <Link href="/app/tv" className="btn-secondary mt-4 inline-flex px-6 py-3 text-lg">{t('misc.onTv.fullGuide')}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center text-xl font-bold text-white">{t('misc.onTv.heading')}</div>
      <p className="text-center text-base text-slate-300">{t('misc.onTv.subheading')}</p>

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand-400/40 bg-brand-500/10 px-4 py-3 text-base text-brand-100">
          <span>{notice}</span>
          <span className="flex flex-none items-center gap-3">
            {noticeSettings && <Link href="/app/settings" className="font-bold underline">{t('misc.onTv.turnOn')}</Link>}
            <button onClick={() => setNotice(null)} aria-label={t('misc.onTv.dismiss')} className="text-xl leading-none">×</button>
          </span>
        </div>
      )}

      {airings.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-2xl border-2 border-white/12 bg-white/[0.04] p-3">
          <div className="h-20 w-14 flex-none overflow-hidden rounded-lg border border-white/10 bg-ink-800">
            {a.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-[10px] text-slate-500">TV</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="line-clamp-1 text-lg font-bold text-white">{a.showName}</span>
              {a.rating != null && <span className="flex-none text-sm font-bold text-gold-300">★ {a.rating.toFixed(1)}</span>}
            </div>
            <div className="text-base font-semibold text-emerald-300">{whenLabel(a.airstamp, t)}{a.network ? ` · ${a.network}` : ''}</div>
          </div>
          <button
            onClick={() => toggle(a)}
            disabled={busy === a.id}
            className={`flex-none rounded-xl border-2 px-3 py-2.5 text-base font-bold transition disabled:opacity-50 ${reminded.has(a.id) ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'}`}
          >
            {reminded.has(a.id) ? t('misc.onTv.remindOn') : t('misc.onTv.remind')}
          </button>
        </div>
      ))}
    </div>
  );
}
