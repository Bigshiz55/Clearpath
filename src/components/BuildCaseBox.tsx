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
  { hint: '📺 On TV tonight', text: 'What’s on TV tonight?' },
  { hint: '🍿 Under 2 hours', text: 'A great movie under two hours' },
  { hint: '👨‍👩‍👧 Family night', text: 'A great family movie for tonight' },
  { hint: '😂 Something funny', text: 'Something genuinely funny' },
  { hint: '😱 Actually scary', text: 'A really good scary movie' },
  { hint: '🔥 New this week', text: 'The best things released this week' },
];

export function BuildCaseBox({ hero = false }: { hero?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const lastCase = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  /**
   * A CHIP FILLS THE BOX. IT DOES NOT OPEN THE KEYBOARD.
   *
   * It used to focus the textarea, and on iOS a programmatic focus inside a tap
   * gesture raises the keyboard — which covers the bottom third of the screen,
   * and "Hit the Gavel" with it. So the one tap that was supposed to be the
   * shortcut left you unable to reach the button it was a shortcut to.
   *
   * Tapping a chip is a complete thought: the words are in the box and the
   * gavel is right there. The keyboard belongs to the box, and appears when you
   * tap the box — which is the other thing this now leaves you free to do.
   */
  function fill(t: string) {
    setText(t);
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
    <div data-testid="statecase-card" className="mx-auto max-w-2xl rounded-2xl border border-brand-400/40 bg-gradient-to-br from-brand-500/15 via-fuchsia-500/10 to-transparent p-3.5 shadow-[0_12px_40px_-16px_rgba(236,72,153,0.45)] sm:p-5">
      {/* Title + one concise supporting line (max two lines). */}
      <div className="flex items-center gap-2.5">
        <span className={hero ? 'text-2xl' : 'text-xl'} aria-hidden>⚖️</span>
        <h2 className={hero ? 'text-lg font-black text-white sm:text-2xl' : 'text-base font-extrabold text-white sm:text-lg'}>State Your Case</h2>
      </div>
      <p className="mt-0.5 text-sm leading-snug text-slate-300">
        Describe what you want, or name a few shows you love.
      </p>

      {/* Textarea — the primary action. ~110px tall, strong border + focus ring. */}
      <textarea
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        /* ENTER RULES; SHIFT+ENTER IS A NEW LINE.
           When the keyboard IS open — because you tapped the box to type — it
           still covers the gavel, and no amount of layout fixes that on a
           phone. The return key is the way out: it is already under your thumb,
           and `enterKeyHint` labels it "go" so it says what it will do. */
        enterKeyHint="go"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        aria-label="Describe what you like to watch"
        placeholder="Try: Clever thrillers with a twist, but nothing too slow or gory."
        className="mt-2.5 h-[84px] w-full resize-none rounded-xl border border-white/25 bg-ink-950/70 px-3.5 py-3 text-base leading-snug text-white placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/40 focus:outline-none"
      />

      {/* Six quick asks, all visible. They used to be three behind a "More
          ideas" toggle, which spent a whole chip slot on a control that only
          revealed more chips. The 44px tap floor means a chip cannot be made
          shorter, so showing the real ones is the only way to make this row
          worth its height. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PRIMARY_EXAMPLES.map((ex) => {
          // THE CHIP YOU TAPPED LOOKS CHOSEN. Without the keyboard springing up
          // as confirmation, the only feedback was the browser's own focus
          // ring — which looks identical to "you happen to be on this one" and
          // vanishes the moment you touch anything else. The words landing in
          // the box are the real feedback; this makes the chip agree with them.
          const chosen = text === ex.text;
          return (
            <button
              key={ex.hint}
              type="button"
              aria-pressed={chosen}
              onClick={() => fill(ex.text)}
              className={`min-h-[44px] rounded-full border px-2.5 text-[13px] font-semibold transition active:scale-95 ${
                chosen
                  ? 'border-brand-300 bg-brand-500/25 text-white'
                  : 'border-white/15 bg-white/[0.06] text-slate-200 hover:border-brand-300 hover:bg-brand-500/20 hover:text-white'
              }`}
            >
              {ex.hint}
            </button>
          );
        })}
      </div>

      {/* Primary CTA — full width, ≥48px, always looks pressable (only dims while
          ruling). An empty tap focuses the box rather than sitting dead-grey. */}
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="wv-cta-3d mt-3 w-full py-3 text-base"
      >
        {busy ? 'Ruling…' : 'Hit the Gavel →'}
      </button>

      <Link
        href="/app/mentalist"
        className="mt-1 flex min-h-[44px] items-center justify-center px-2 text-center text-xs font-semibold text-brand-200 underline-offset-2 hover:text-white hover:underline"
      >
        Or name a few titles you love — we’ll figure out your taste →
      </Link>
    </div>
  );
}
