'use client';

import { useState } from 'react';
import { OnTvGuide } from './OnTvGuide';
import type { Airing } from '@/lib/onTv';

/** Toggle between the live broadcast guide and today's streaming premieres. */
export function OnTvTabs({
  broadcast,
  streaming,
  dateLabel,
  country,
  remindedIds = [],
}: {
  broadcast: Airing[];
  streaming: Airing[];
  dateLabel: string;
  country: string;
  remindedIds?: number[];
}) {
  const [tab, setTab] = useState<'broadcast' | 'streaming'>('broadcast');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-white/12 bg-white/5 p-1">
        <button
          onClick={() => setTab('broadcast')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'broadcast' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}
        >
          📡 On TV now
        </button>
        <button
          onClick={() => setTab('streaming')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === 'streaming' ? 'bg-brand-500 text-white shadow-glow' : 'text-slate-300 hover:text-white'}`}
        >
          🍿 Streaming today{streaming.length > 0 ? ` (${streaming.length})` : ''}
        </button>
      </div>

      {tab === 'broadcast' ? (
        <OnTvGuide airings={broadcast} dateLabel={dateLabel} country={country} mode="broadcast" remindedIds={remindedIds} />
      ) : (
        <OnTvGuide airings={streaming} dateLabel={dateLabel} country={country} mode="streaming" remindedIds={remindedIds} />
      )}
    </div>
  );
}
