'use client';

import { useState, useTransition } from 'react';
import { startProCheckout, toggleProForTesting } from '@/lib/actions/pro';

export function ProUpgradeButton({ isAdmin }: { isAdmin: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function upgrade() {
    setMsg(null);
    startTransition(async () => {
      const r = await startProCheckout();
      if (r.status === 'redirect' && r.url) { window.location.href = r.url; return; }
      setMsg(r.message ?? 'Checkout isn’t available yet.');
    });
  }

  return (
    <div>
      <button onClick={upgrade} disabled={pending} className="btn-primary w-full py-3.5 text-base font-bold disabled:opacity-50">
        {pending ? 'One moment…' : '✨ Go Pro'}
      </button>
      {msg && <p className="mt-2 text-center text-sm text-gold-200">{msg}</p>}
      {isAdmin && (
        <button
          onClick={() => startTransition(async () => { const r = await toggleProForTesting(); setMsg(r.ok ? `Pro ${r.pro ? 'enabled' : 'disabled'} (admin test)` : r.error ?? 'Failed'); })}
          disabled={pending}
          className="btn-ghost mt-2 w-full text-xs text-slate-400 disabled:opacity-50"
        >
          🛠 Admin: toggle my Pro (testing)
        </button>
      )}
    </div>
  );
}
