'use client';

import { useEffect, useState } from 'react';

const KEY = 'wv_simple';

/** One-tap Simple (Senior) view: bigger text, bigger buttons, higher contrast. */
export function SimpleModeToggle({ variant = 'header' }: { variant?: 'header' | 'full' }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.documentElement.getAttribute('data-simple') === '1');
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    if (next) {
      document.documentElement.setAttribute('data-simple', '1');
      try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    } else {
      document.documentElement.removeAttribute('data-simple');
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }
  }

  if (variant === 'full') {
    return (
      <button
        onClick={toggle}
        className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
          on ? 'border-brand-400/60 bg-brand-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}
      >
        <span>
          <span className="block font-semibold text-white">Simple view {on ? '· On' : '· Off'}</span>
          <span className="block text-sm text-slate-400">
            Bigger text and buttons, higher contrast — easier to read and tap. Tap again to turn off.
          </span>
        </span>
        <span className={`text-2xl ${on ? 'text-brand-300' : 'text-slate-500'}`}>{on ? '🅰️' : 'Aa'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      title="Simple view: bigger text and buttons"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition ${
        on ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
      }`}
    >
      <span aria-hidden className="text-base font-bold leading-none">A</span>
      <span className="hidden sm:inline">{on ? 'Simple view on' : 'Simple view'}</span>
    </button>
  );
}
