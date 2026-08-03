'use client';

import { useEffect, useRef, useState } from 'react';

interface Stage {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
}

const STAGES: Stage[] = [
  { key: 'evidence', eyebrow: '01', title: 'The evidence', body: 'General quality, audience response, and availability.' },
  { key: 'taste', eyebrow: '02', title: 'Your taste', body: 'What fits this specific viewer.' },
  { key: 'verdict', eyebrow: '03', title: 'The Verd1ct', body: 'One clear recommendation and where to watch.' },
];

const ROTATE_MS = 4200;

/**
 * THE PROCESS, NOT A FAKE RESULT.
 *
 * This used to sit beside the hero as a static mock result card: a specific
 * title, a specific score, a specific "your match" number. None of that can
 * be honest here — there is no taste profile for a visitor who hasn't told
 * the app anything yet, so a "your match: 94" badge would always be an
 * invented number wearing a real UI. TMDB/Watchmode data could make the
 * OTHER two stages real, but showing evidence and availability for a title
 * while faking the match number next to it would be worse than showing
 * neither — half-real reads as more credible than it is.
 *
 * So this shows what the engine actually DOES instead of a result it
 * produced: three short stages, self-playing, abstract on purpose. No
 * title, no score, no provider name — just the shape of the process, in the
 * app's own visual language (the DNA twist + halo from DnaBurst, the gavel
 * reveal from Live Court).
 */
export function VerdictProcessPreview() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Only animate while the section is actually on screen — no point spending
  // a timer (or a battery) rotating a panel nobody is looking at yet.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, visible]);

  const stage = STAGES[active]!;

  return (
    <section className="border-t border-white/10" data-testid="verdict-process-preview">
      <div className="container-page py-14 sm:py-20">
        <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-500">How a Verd1ct gets made</h2>

        <div
          ref={rootRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="mx-auto mt-6 max-w-2xl"
        >
          <div className="flex flex-wrap items-center justify-center gap-2" role="tablist" aria-label="How WatchVerd1ct reaches a Verd1ct">
            {STAGES.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={i === active}
                data-testid={`vpp-tab-${s.key}`}
                onClick={() => setActive(i)}
                className={`min-h-[44px] rounded-full border px-4 text-xs font-bold uppercase tracking-wide transition ${
                  i === active
                    ? 'border-gold-400/60 bg-gold-500/15 text-amber-100'
                    : 'border-white/10 bg-white/[0.03] text-slate-500 hover:border-white/25 hover:text-slate-300'
                }`}
              >
                {s.eyebrow} · {s.title}
              </button>
            ))}
          </div>

          <div key={stage.key} className="wv-reveal-in mt-8 text-center" data-testid="vpp-panel">
            <StageIcon stageKey={stage.key} />
            <h3 className="mt-4 text-xl font-black text-white">{stage.title}</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-400">{stage.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function StageIcon({ stageKey }: { stageKey: string }) {
  if (stageKey === 'evidence') {
    // Three abstract meter bars — evocative of "gathering signal", not a
    // score. No numbers: this is illustrative, never a claimed value.
    return (
      <div className="mx-auto flex h-14 items-end justify-center gap-1.5" aria-hidden>
        <span className="wv-reveal-in h-8 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="wv-reveal-in h-11 w-2.5 rounded-full bg-emerald-400/70" style={{ animationDelay: '90ms' }} />
        <span className="wv-reveal-in h-6 w-2.5 rounded-full bg-emerald-400/70" style={{ animationDelay: '180ms' }} />
      </div>
    );
  }
  if (stageKey === 'taste') {
    return (
      <div className="relative mx-auto grid h-14 w-14 place-items-center" aria-hidden>
        <span className="wv-dna-halo absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-[#ff1493]/25 blur-md" />
        <span className="wv-dna-twist relative text-3xl leading-none">🧬</span>
      </div>
    );
  }
  return (
    <div className="relative mx-auto grid h-14 w-14 place-items-center" aria-hidden>
      <span className="wv-gavel absolute text-3xl leading-none">⚖️</span>
    </div>
  );
}
