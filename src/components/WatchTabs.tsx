'use client';

import { useState } from 'react';

/** Switches the Watch Now page between the personalized "Ready to watch" view
 *  and the full JustWatch-style "Browse everything" catalog. Both are rendered
 *  on the server and passed in; this only toggles which is shown. */
export function WatchTabs({
  ready,
  browse,
  initialTab = 'ready',
}: {
  ready: React.ReactNode;
  browse: React.ReactNode;
  initialTab?: 'ready' | 'browse';
}) {
  const [tab, setTab] = useState<'ready' | 'browse'>(initialTab);
  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-white/12 bg-white/5 p-1">
        <button
          onClick={() => setTab('ready')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'ready' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}
        >
          ▶ Ready to watch
        </button>
        <button
          onClick={() => setTab('browse')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'browse' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}
        >
          🔎 Browse everything
        </button>
      </div>
      <div className={tab === 'ready' ? '' : 'hidden'}>{ready}</div>
      <div className={tab === 'browse' ? '' : 'hidden'}>{browse}</div>
    </div>
  );
}
