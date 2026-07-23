'use client';

import { useEffect, useState } from 'react';
import { publicEnv } from '@/lib/env';
import { savePushSubscription, removePushSubscription, sendTestPush } from '@/lib/actions/push';
import { useToast } from '@/components/Toast';
import { useT } from '@/i18n/I18nProvider';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'checking' | 'unsupported' | 'off' | 'on' | 'busy';

export function EnableNotifications() {
  const [state, setState] = useState<State>('checking');
  const toast = useToast();
  const t = useT();
  const vapid = publicEnv.vapidPublicKey();

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState('unsupported');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setState(sub ? 'on' : 'off');
      } catch {
        setState('off');
      }
    })();
  }, []);

  async function enable() {
    if (!vapid) {
      toast.show(t('account.notifications.notConfigured'), 'error');
      return;
    }
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.show(t('account.notifications.blocked'), 'error');
        setState('off');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await savePushSubscription({
        endpoint: json.endpoint ?? '',
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      });
      if (!res.ok) {
        toast.show(res.error ?? t('account.notifications.failedSave'), 'error');
        setState('off');
        return;
      }
      setState('on');
      toast.show(t('account.notifications.enabledOn'), 'success');
    } catch {
      toast.show(t('account.notifications.enableFailed'), 'error');
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await removePushSubscription(sub.endpoint).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
      toast.show(t('account.notifications.turnedOff'), 'info');
    } catch {
      setState('off');
    }
  }

  async function test() {
    const res = await sendTestPush();
    toast.show(res.ok ? t('account.notifications.testSent') : res.error ?? t('account.notifications.testFailed'), res.ok ? 'success' : 'error');
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-slate-400">
        {t('account.notifications.unsupported')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === 'on' ? (
        <>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100">
            {t('account.notifications.onThisDevice')}
          </span>
          <button onClick={test} className="btn-secondary text-sm">{t('account.notifications.sendTest')}</button>
          <button onClick={disable} className="btn-ghost text-sm">{t('account.notifications.turnOff')}</button>
        </>
      ) : (
        <button onClick={enable} disabled={state === 'busy' || state === 'checking'} className="btn-primary">
          {state === 'busy' ? t('account.notifications.enabling') : t('account.notifications.turnOn')}
        </button>
      )}
    </div>
  );
}
