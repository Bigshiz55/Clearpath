'use client';

import { useMemo, useState } from 'react';
import { generateOutreach, CHANNEL_LABELS, type OutreachChannel } from '@/lib/growth/outreach';
import { publicEnv } from '@/lib/env';

const CHANNELS = Object.keys(CHANNEL_LABELS) as OutreachChannel[];

export default function OutreachPage() {
  const [channel, setChannel] = useState<OutreachChannel>('email');
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const draft = useMemo(
    () => generateOutreach(channel, { name, audience, link: link || `${publicEnv.siteUrl()}/app/quiz` }),
    [channel, name, audience, link],
  );
  const full = (draft.subject ? `Subject: ${draft.subject}\n\n` : '') + draft.body;

  async function copy() {
    try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no-op */ }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-black text-white">Outreach generator</h1>
        <p className="text-sm text-slate-400">Personalized, non-spammy drafts. Review, edit, copy, and send yourself — nothing is sent automatically.</p>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <select value={channel} onChange={(e) => setChannel(e.target.value as OutreachChannel)} className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white">
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name / handle" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Audience (e.g. film TikTok, 40k)" className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Your tracked /go/… link" className="col-span-2 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-white placeholder:text-slate-500" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Draft</span>
          <button onClick={copy} className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400">{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        {draft.subject && <div className="mb-1 text-sm font-semibold text-white">Subject: {draft.subject}</div>}
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{draft.body}</pre>
      </div>
      <p className="text-xs text-slate-500">Tip: paste your tracked link from Campaigns so every reply is attributable.</p>
    </div>
  );
}
