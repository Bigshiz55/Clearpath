'use client';

/**
 * "YOUR VERDICT DNA IS READY" — the reveal.
 *
 * The celebratory payoff of the interview: the overall confidence, the axes that
 * define you (with how strongly you lean), your hard dealbreakers and must-haves,
 * any titles the profile predicts you'll love or hate, and how distinctive your
 * taste is versus the mainstream. Every section degrades gracefully to nothing
 * when the interview didn't surface it — the reveal never shows an empty shell or
 * a fabricated title (the engine leaves predicted titles for the server to fill
 * from the real catalogue, so an empty list here is honest, not broken).
 *
 * Renders straight from the `DnaReveal` payload, so it is correct on first paint
 * and provable in a static render test.
 */
import type { DnaReveal as DnaRevealPayload, DnaRevealCategory } from '@/lib/voice/interview';
import { ConfidenceMeter } from './ConfidenceMeter';

function distinctivenessLabel(d: number): string {
  if (d >= 0.6) return 'Wildly your own';
  if (d >= 0.4) return 'Distinctly you';
  if (d >= 0.22) return 'A clear lean';
  return 'Comfortably mainstream';
}

function dispositionWord(c: DnaRevealCategory): string {
  if (c.disposition > 0.15) return 'love';
  if (c.disposition < -0.15) return 'avoid';
  return 'know';
}

function Chips({ items, tone, testid }: { items: string[]; tone: string; testid: string }) {
  return (
    <ul className="flex flex-wrap gap-2" data-testid={testid}>
      {items.map((s) => (
        <li key={s} className={`rounded-full border px-3 py-1 text-sm font-medium capitalize ${tone}`}>
          {s}
        </li>
      ))}
    </ul>
  );
}

export function DnaReveal({ reveal, onRestart }: { reveal: DnaRevealPayload; onRestart?: () => void }) {
  const distinctPct = Math.round(reveal.distinctiveness * 100);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6" data-testid="dna-reveal">
      <div className="flex flex-col items-center gap-1 text-center" style={{ animation: 'wv-reveal-in 600ms ease both' }}>
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Verdict DNA</span>
        <h2 className="text-2xl font-black text-white sm:text-3xl">Here&rsquo;s who you are on screen</h2>
      </div>

      <ConfidenceMeter value={reveal.overallConfidence} label="We know you" />

      {/* Defining axes */}
      {reveal.topCategories.length > 0 ? (
        <div className="card w-full p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">What defines your taste</h3>
          <ul className="mt-3 flex flex-col gap-2.5" data-testid="reveal-top-categories">
            {reveal.topCategories.map((c) => {
              const strength = Math.round(Math.abs(c.disposition) * 100);
              const word = dispositionWord(c);
              const barColor = c.disposition >= 0 ? 'bg-emerald-400/80' : 'bg-rose-400/80';
              return (
                <li key={c.category} className="flex items-center gap-3">
                  <span className="w-36 flex-none truncate text-sm text-slate-100">{c.label}</span>
                  <span className="w-14 flex-none text-[11px] font-semibold uppercase tracking-wide text-slate-400">{word}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className={`block h-full rounded-full ${barColor}`} style={{ width: `${Math.max(6, strength)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid w-full gap-4 sm:grid-cols-2">
        {reveal.mustHaves.length > 0 ? (
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-300">Must-haves</h3>
            <Chips items={reveal.mustHaves} tone="border-emerald-400/40 bg-emerald-500/10 text-emerald-100" testid="reveal-must-haves" />
          </div>
        ) : null}
        {reveal.dealBreakers.length > 0 ? (
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-rose-300">Dealbreakers</h3>
            <Chips items={reveal.dealBreakers} tone="border-rose-400/40 bg-rose-500/10 text-rose-100" testid="reveal-deal-breakers" />
          </div>
        ) : null}
      </div>

      {reveal.predictedLoves.length > 0 || reveal.predictedHates.length > 0 ? (
        <div className="grid w-full gap-4 sm:grid-cols-2">
          {reveal.predictedLoves.length > 0 ? (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-300">You&rsquo;ll love</h3>
              <Chips items={reveal.predictedLoves} tone="border-emerald-400/40 bg-emerald-500/10 text-emerald-100" testid="reveal-predicted-loves" />
            </div>
          ) : null}
          {reveal.predictedHates.length > 0 ? (
            <div className="card p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-rose-300">Skip these</h3>
              <Chips items={reveal.predictedHates} tone="border-rose-400/40 bg-rose-500/10 text-rose-100" testid="reveal-predicted-hates" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card flex w-full items-center justify-between gap-4 p-5" data-testid="reveal-distinctiveness">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">How unique your taste is</h3>
          <p className="mt-0.5 text-lg font-black text-white">{distinctivenessLabel(reveal.distinctiveness)}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums text-gold-300">{distinctPct}%</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">off the beaten path</div>
        </div>
      </div>

      {onRestart ? (
        <button type="button" className="btn-secondary" onClick={onRestart} data-testid="reveal-restart">
          Start a fresh interview
        </button>
      ) : null}
    </section>
  );
}
