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
// Chips: the first three are shown up front (mobile-clean); the rest reveal on
// "More ideas". Each `text` is the full query dropped into the box; `hint` is the
// short chip label. Kept broad and mainstream — not tuned to one person's taste.
const PRIMARY_EXAMPLES: { hint: string; text: string }[] = [
  { hint: 'What’s on TV tonight?', text: 'What’s on TV tonight?' },
  { hint: 'Best movies on Netflix', text: 'The best movies on Netflix right now' },
  { hint: 'Family movie night', text: 'A great family movie for tonight' },
];
const MORE_EXAMPLES: { hint: string; text: string }[] = [
  { hint: 'Where can I stream Barbie?', text: 'Where can I stream Barbie?' },
  { hint: 'On in the next 2 hours', text: 'Movies coming on in the next 2 hours' },
  { hint: 'A really good scary movie', text: 'A really good scary movie' },
];

export function BuildCaseBox({ hero = false }: { hero?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  function fill(t: string) {
    setText(t);
    boxRef.current?.focus();
  }

  async function submit() {
    const t = text.trim();
    if (busy) return;
    // Never a dead-looking button: an empty tap just guides the user to the box.
    if (t.length < 4) {
      boxRef.current?.focus();
      toast.show('Tell us a little more — a few words is enough.', 'info');
      return;
    }
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
      setText('');
      // If the case included an actionable ask (e.g. "coming on in the next 12
      // hours" or "something on Netflix"), the server routes us to the right
      // screen. `stay` = a lookup that found nothing — keep them here with the note.
      if (typeof d.redirect === 'string') {
        toast.show(d.summary || 'Pulling your ruling…', 'verdict');
        router.push(d.redirect);
      } else {
        toast.show(d.summary ? `⚖️ ${d.summary}` : 'Got it — building your VERDICT DNA. 🧬', 'success');
        if (!d.stay) router.push('/app/watch');
      }
    } catch {
      toast.show('Could not read that — try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="statecase-card" className="mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-br from-brand-500/15 via-fuchsia-500/10 to-transparent p-4 shadow-[0_12px_40px_-16px_rgba(236,72,153,0.45)] sm:p-5">
      {/* Title + one concise supporting line (max two lines). */}
      <div className="flex items-center gap-2.5">
        <span className={hero ? 'text-2xl' : 'text-xl'} aria-hidden>⚖️</span>
        <h2 className={hero ? 'text-lg font-black text-white sm:text-2xl' : 'text-base font-extrabold text-white sm:text-lg'}>State Your Case</h2>
      </div>
      <p className="mt-1 text-sm leading-snug text-slate-300">
        Describe what you want, or name a few shows and movies you love.
      </p>

      {/* Textarea — the primary action. ~110px tall, strong border + focus ring. */}
      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
        aria-label="Describe what you like to watch"
        placeholder="Try: Clever thrillers with a twist, but nothing too slow or gory."
        className="mt-3 h-[112px] w-full resize-none rounded-xl border border-white/25 bg-ink-950/70 px-3.5 py-3 text-base leading-snug text-white placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/40 focus:outline-none"
      />

      {/* Three suggestion chips, then "More ideas" reveals the rest. Consistent
          height/padding, wrap cleanly, readable at 320px. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {PRIMARY_EXAMPLES.map((ex) => (
          <button
            key={ex.hint}
            type="button"
            onClick={() => fill(ex.text)}
            className="min-h-[36px] rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/20 hover:text-white active:scale-95"
          >
            {ex.hint}
          </button>
        ))}
        {showMore &&
          MORE_EXAMPLES.map((ex) => (
            <button
              key={ex.hint}
              type="button"
              onClick={() => fill(ex.text)}
              className="min-h-[36px] rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold text-slate-200 transition hover:border-brand-300 hover:bg-brand-500/20 hover:text-white active:scale-95"
            >
              {ex.hint}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="min-h-[36px] rounded-full border border-brand-300/40 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-brand-200 transition hover:bg-brand-500/15 active:scale-95"
        >
          {showMore ? 'Fewer ideas' : 'More ideas'}
        </button>
      </div>

      {/* Primary CTA — full width, ≥48px, always looks pressable (only dims while
          ruling). An empty tap focuses the box rather than sitting dead-grey. */}
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="wv-cta-3d mt-4 w-full py-3.5 text-lg"
      >
        {busy ? 'Ruling…' : 'Hit the Gavel →'}
      </button>

      <Link
        href="/app/mentalist"
        className="mt-3 block text-center text-xs font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline"
      >
        Or name a few titles you love — we’ll figure out your taste →
      </Link>
    </div>
  );
}
