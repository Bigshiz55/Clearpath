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
// The kinds of things you can ask — one per router capability. Tapping a chip
// drops the example into the box so it's obvious what VERD1CT can do. The live-TV
// listing asks are first so it's clear we know what's actually on right now.
const EXAMPLES: { hint: string; text: string }[] = [
  { hint: '📺 On live TV', text: "What's on Lifetime tonight" },
  { hint: '⏱️ Coming up', text: 'Comedies coming on in the next 4 hours' },
  { hint: '🎯 Your taste', text: 'I love smart crime mysteries, but I avoid supernatural stories and anything too slow.' },
  { hint: '🔎 Where to stream', text: 'Where can I watch Jaws?' },
  { hint: '▶️ On a service', text: "Something great on Netflix I haven't seen" },
];

/** The gavel — slams while the ruling is being handed down. */
function Gavel({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m14 13-7.4 7.4a2.12 2.12 0 0 1-3-3L11 10" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}

export function BuildCaseBox({ hero = false }: { hero?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [slam, setSlam] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  async function submit() {
    const t = text.trim();
    if (t.length < 4 || busy) return;
    setBusy(true);
    // Let the gavel finish its slam even on a fast response — the "ruling" beat
    // is part of the brand, so we never navigate before it lands.
    const minSlam = new Promise((res) => setTimeout(res, 720));
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
      await minSlam;
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

  // The gavel is the trigger: dropping it in and striking the button IS the
  // submit. It slams (0.62s) while the case is read; the min-slam floor keeps us
  // from navigating before the strike lands.
  function hitGavel() {
    if (busy || text.trim().length < 4) return;
    setSlam(true);
    // A sharp "thwack" buzz timed to the strike (Android; a no-op on iOS Safari).
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      window.setTimeout(() => navigator.vibrate?.([0, 35, 25, 15]), 350);
    }
    void submit().finally(() => setSlam(false));
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
          <div className={hero ? 'text-sm font-medium text-slate-100 sm:text-base' : 'text-sm text-slate-300'}>
            Describe your taste — or ask for something specific: what’s on <span className="font-semibold text-white">live TV</span>, <span className="font-semibold text-white">where to stream</span> a title, or what’s good <span className="font-semibold text-white">on a service</span>.
          </div>
        </div>
      </div>

      {/* Tappable examples — one per kind of question, so the range is obvious.
          Live-TV listings lead so it's clear we show what's actually on. */}
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Try one — tap to fill</div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.hint}
              type="button"
              onClick={() => { setText(ex.text); boxRef.current?.focus(); }}
              className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/20 hover:text-white"
            >
              {ex.hint}
            </button>
          ))}
        </div>
      </div>

      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        rows={3}
        aria-label="Describe what you like to watch"
        placeholder="e.g. I love intelligent crime mysteries, but I avoid supernatural stories and anything too slow."
        className={
          hero
            ? 'mt-3 w-full resize-none rounded-xl border border-white/20 bg-ink-950/70 px-4 py-3.5 text-base font-medium text-white placeholder:text-slate-400 focus:border-brand-400 focus:outline-none'
            : 'mt-3 w-full resize-none rounded-xl border border-white/15 bg-ink-950/70 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none'
        }
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href="/app/mentalist" className={hero ? 'text-sm font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline' : 'text-xs font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline'}>
          Or just name a few shows you love — we’ll figure out your taste →
        </Link>
        {/* Full-screen flash the instant the gavel lands. */}
        {slam && <div aria-hidden className="wv-screen-flash pointer-events-none fixed inset-0 z-[200] bg-white" />}
        <div className="relative shrink-0">
          {slam && (
            <>
              {/* The big gavel that drops in and slams the button. */}
              <span aria-hidden className="wv-gavel-drop pointer-events-none absolute left-1/2 top-0 z-20 text-white drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)]">
                <Gavel className="h-24 w-24" />
              </span>
              {/* Shock ring on impact. */}
              <span aria-hidden className="wv-strike-ring pointer-events-none absolute left-1/2 top-1/2 z-10 h-20 w-20 rounded-full border-[3px] border-brand-200" />
            </>
          )}
          <button
            onClick={hitGavel}
            disabled={busy || text.trim().length < 4}
            className={`btn-primary inline-flex items-center gap-1.5 text-white disabled:cursor-not-allowed ${slam ? 'wv-btn-impact' : ''} ${hero ? 'px-6 py-3 text-base font-black disabled:opacity-80' : 'disabled:opacity-60'}`}
          >
            {busy ? 'Ruling…' : (<>Hit the gavel <Gavel className="h-4 w-4" /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
