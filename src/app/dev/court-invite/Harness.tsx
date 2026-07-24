'use client';

import { useMemo, useState } from 'react';
import { CourtInviteBox } from '@/components/court/CourtInviteBox';
import type { InviteNavigator } from '@/lib/courtInvite';

declare global {
  interface Window {
    __shareCalls?: number;
    __lastShare?: ShareData;
    __clipWrites?: number;
    __lastClip?: string;
    __execCopies?: number;
  }
}

/**
 * Deterministic Court-invite harness. `mode` selects a fake navigator so Playwright
 * can exercise every branch without a real share sheet or backend. Call counts are
 * exposed on `window` for assertions.
 */
export function CourtInviteHarness({ url, qr, mode }: { url: string; qr: string | null; mode: string }) {
  const [showQr, setShowQr] = useState<boolean>(qr != null);

  const { getNavigator, execCopy } = useMemo(() => {
    if (typeof window !== 'undefined') {
      window.__shareCalls = 0; window.__clipWrites = 0; window.__execCopies = 0;
    }
    const record = (n: '__shareCalls' | '__clipWrites' | '__execCopies') => {
      if (typeof window !== 'undefined') { const w = window as unknown as Record<string, number>; w[n] = (w[n] ?? 0) + 1; }
    };

    const clipboard = { writeText: async (t: string) => { record('__clipWrites'); if (typeof window !== 'undefined') window.__lastClip = t; if (mode === 'clipfail') throw new Error('clipboard denied'); } };
    const shareOk = async (d: ShareData) => { record('__shareCalls'); if (typeof window !== 'undefined') window.__lastShare = d; };
    const shareCancel = async (d: ShareData) => { record('__shareCalls'); if (typeof window !== 'undefined') window.__lastShare = d; throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    const shareError = async (d: ShareData) => { record('__shareCalls'); if (typeof window !== 'undefined') window.__lastShare = d; throw new Error('share exploded'); };
    const shareHang = (d: ShareData) => { record('__shareCalls'); if (typeof window !== 'undefined') window.__lastShare = d; return new Promise<void>(() => {}); };

    let nav: InviteNavigator;
    switch (mode) {
      case 'cancel': nav = { share: shareCancel, clipboard }; break;
      case 'error': nav = { share: shareError, clipboard }; break;
      case 'hang': nav = { share: shareHang, clipboard }; break;
      case 'unsupported': nav = { clipboard }; break;
      case 'clipfail': nav = { clipboard }; break; // clipboard throws → execCopy false → modal
      case 'share':
      default: nav = { share: shareOk, clipboard }; break;
    }
    const exec = (_t: string) => { record('__execCopies'); return mode !== 'clipfail'; };
    return { getNavigator: () => nav, execCopy: exec };
  }, [mode]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <h1 className="mb-4 text-lg font-black text-white">Court Invite Harness <span className="text-slate-400">· {mode}</span></h1>
      <div className="card p-5 text-center">
        <div className="text-xs uppercase tracking-widest text-brand-300">Waiting room · 2 in</div>
        <CourtInviteBox
          url={url}
          roomName="room ABCD"
          qr={showQr ? qr : null}
          onToggleQr={() => setShowQr((v) => !v)}
          getNavigator={getNavigator}
          execCopy={execCopy}
        />
      </div>
    </main>
  );
}
