'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

/**
 * "State Your Case" — the low-friction way to start a Taste DNA: just type what
 * you like / dislike / avoid in plain words. The server parses it into targeted
 * DNA signals (and seeds any titles you name), so there's no click-through to a
 * separate flow. (The title-by-title Mentalist is still one tap away.)
 */
export function BuildCaseBox() {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = text.trim();
    if (t.length < 4 || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/build-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json();
      if (d.error) { toast.show(d.error, 'error'); return; }
      toast.show(d.summary ? `⚖️ ${d.summary}` : 'Got it — building your Taste DNA. 🧬', 'success');
      setText('');
      router.push('/app/watch');
    } catch {
      toast.show('Could not read that — try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/15 via-fuchsia-500/10 to-transparent p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>⚖️</span>
        <div className="min-w-0">
          <div className="text-base font-extrabold text-white sm:text-lg">State Your Case</div>
          <div className="text-sm text-slate-300">Just tell us what you like — in your own words. We’ll build your Taste DNA from it.</div>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        rows={3}
        aria-label="Describe what you like to watch"
        placeholder="e.g. I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow."
        className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href="/app/mentalist" className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
          Prefer to name titles you love? →
        </Link>
        <button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 4}
          className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Building…' : 'Build my Taste DNA →'}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">Powered by the WatchVerdict Mentalist</p>
    </div>
  );
}
