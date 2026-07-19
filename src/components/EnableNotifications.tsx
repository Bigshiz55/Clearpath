'use client';

import { useEffect, useState } from 'react';
import { publicEnv } from '@/lib/env';
import { savePushSubscription, removePushSubscription, sendTestPush } from '@/lib/actions/push';
import { useToast } from '@/components/Toast';

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
      toast.show('Push isn’t configured on the server yet (VAPID keys).', 'error');
      return;
    }
    setState('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.show('Notifications were blocked. Enable them in your browser settings to turn this on.', 'error');
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
        toast.show(res.error ?? 'Failed to save.', 'error');
        setState('off');
        return;
      }
      setState('on');
      toast.show('Notifications on. We’ll only ping you about things worth opening the app for.', 'success');
    } catch {
      toast.show('Couldn’t enable notifications on this device.', 'error');
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
      toast.show('Notifications off.', 'info');
    } catch {
      setState('off');
    }
  }

  async function test() {
    const res = await sendTestPush();
    toast.show(res.ok ? 'Sent — check your notifications.' : res.error ?? 'Failed.', res.ok ? 'success' : 'error');
  }

  if (state === 'unsupported') {
    return (
      <p className="text-sm text-slate-400">
        This browser doesn’t support push notifications. On iPhone, add WatchVrdIQt to your Home Screen first
        (Share → Add to Home Screen), then open it from there and this will appear.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === 'on' ? (
        <>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-100">
            ✓ On for this device
          </span>
          <button onClick={test} className="btn-secondary text-sm">Send test</button>
          <button onClick={disable} className="btn-ghost text-sm">Turn off</button>
        </>
      ) : (
        <button onClick={enable} disabled={state === 'busy' || state === 'checking'} className="btn-primary">
          {state === 'busy' ? 'Enabling…' : '🔔 Turn on notifications'}
        </button>
      )}
    </div>
  );
}
