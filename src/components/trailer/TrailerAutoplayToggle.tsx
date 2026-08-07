'use client';

import { useEffect, useState } from 'react';
import { getAutoplayPref, setAutoplayPref, type AutoplayPref } from '@/lib/trailer/prefs';

/**
 * The user's control over trailer autoplay. Saved on this device (localStorage),
 * so it works signed-out and takes effect immediately across open cards. "Off"
 * truly prevents automatic playback — a trailer then waits for a tap.
 */
export function TrailerAutoplayToggle() {
  const [pref, setPref] = useState<AutoplayPref>('on');
  useEffect(() => {
    setPref(getAutoplayPref());
  }, []);

  const on = pref === 'on';
  const set = (v: AutoplayPref) => {
    setPref(v);
    setAutoplayPref(v);
  };

  return (
    <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
      <span className="text-sm font-medium text-slate-100">
        Autoplay trailers
        <span className="mt-0.5 block text-xs font-normal text-slate-400">
          Preview trailers play muted as you browse. Off keeps posters until you tap play.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Autoplay trailers"
        onClick={() => set(on ? 'off' : 'on')}
        className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition ${on ? 'bg-brand-500' : 'bg-white/15'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
