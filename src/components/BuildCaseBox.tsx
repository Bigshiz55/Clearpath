'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

/**
 * "State Your Case" — the low-friction way to start a Taste DNA: just type what
 * you like / dislike / avoid in plain words, or make a request. The server
 * parses it into targeted DNA signals and routes actionable asks (where to
 * watch a title, something on a service, what's coming on) to the right screen.
 * (The title-by-title Mentalist is still one tap away.)
 */
export function BuildCaseBox({ hero = false }: { hero?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  async function submit() {
    const t = text.trim();
    if (t.length < 4 || busy) return;
    setBusy(true);
    try {
      // A resubmit within 90s is a likely rephrase → a weak "that missed" label
      // on the previous parse (step 1 of the accuracy flywheel).
      const now = Date.now();
      const priorCaseId = lastCase.current.id && now - lastCase.current.at < 90_000 ? lastCase.current.id : null;
      const r = await fetch('/api/build-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, source: 'text', lang: 'en', priorCaseId }),
      });
      const d = await r.json();
      if (d.error) { toast.show(d.error, 'error'); return; }
      if (typeof d.caseId === 'string') lastCase.current = { id: d.caseId, at: Date.now() };
      toast.show(d.summary ? `⚖️ ${d.summary}` : 'Got it — building your Taste DNA. 🧬', 'success');
      setText('');
      // If the case included an actionable ask (e.g. "coming on in the next 12
      // hours" or "something on Netflix"), the server routes us to the right
      // screen. `stay` = a lookup that found nothing — keep them here with the note.
      if (typeof d.redirect === 'string') router.push(d.redirect);
      else if (!d.stay) router.push('/app/watch');
    } catch {
      toast.show('Could not read that — try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        hero
          ? 'mx-auto max-w-2xl rounded-3xl border-2 border-brand-400/50 bg-gradient-to-br from-brand-500/20 via-fuchsia-500/10 to-transparent p-5 shadow-[0_16px_50px_-16px_rgba(236,72,153,0.55)] sm:p-6'
          : 'mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/15 via-fuchsia-500/10 to-transparent p-4'
      }
    >
      <div className="flex items-center gap-3">
        <span className={hero ? 'text-3xl' : 'text-2xl'} aria-hidden>⚖️</span>
        <div className="min-w-0">
          <div className={hero ? 'text-xl font-black text-white sm:text-2xl' : 'text-base font-extrabold text-white sm:text-lg'}>State Your Case</div>
          <div className={hero ? 'text-sm font-medium text-slate-100 sm:text-base' : 'text-sm text-slate-300'}>Tell us what you like — or ask for something specific, like “crime shows coming on in the next few hours.”</div>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        rows={3}
        aria-label="Describe what you like to watch"
        placeholder="e.g. I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow."
        className={
          hero
            ? 'mt-4 w-full resize-none rounded-xl border border-white/20 bg-ink-950/70 px-4 py-3.5 text-base font-medium text-white placeholder:text-slate-400 focus:border-brand-400 focus:outline-none'
            : 'mt-3 w-full resize-none rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none'
        }
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href="/app/mentalist" className={hero ? 'text-sm text-slate-300 underline-offset-2 hover:text-white hover:underline' : 'text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline'}>
          Prefer to name titles you love? →
        </Link>
        <button
          onClick={() => void submit()}
          disabled={busy || text.trim().length < 4}
          className={`btn-primary shrink-0 text-white disabled:cursor-not-allowed ${hero ? 'px-6 py-3 text-base font-black disabled:opacity-70' : 'disabled:opacity-50'}`}
        >
          {busy ? 'Building…' : 'Build my Taste DNA →'}
        </button>
      </div>
      <p className={hero ? 'mt-2 text-xs text-slate-400' : 'mt-1.5 text-[11px] text-slate-500'}>Powered by the WatchVerdict Mentalist</p>
    </div>
  );
}
