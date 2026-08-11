'use client';

/**
 * THE TWIST, SHOWN AS THE EXPERIMENT IT IS.
 *
 * The first version of this act was one sentence floating in the middle of a
 * tall phone — "Same as The Godfather — but it's subtitled." It read as a
 * throwaway question, and it wasted the most valuable interaction in the
 * product on the emptiest screen in it.
 *
 * The mechanism is a controlled counterfactual: one attribute moves, everything
 * else is pinned. So the card renders both halves — the anchor title as HELD,
 * with the thing that actually is (its hook), and the single changed attribute
 * stamped underneath. The player can see what is being held constant, which is
 * the difference between an honest experiment and a trick question.
 *
 * The variable comes from `twist.change`, never from parsing the prompt, so
 * this component cannot misreport which axis moved.
 */

import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { hookFor, hookParts } from '@/lib/tonight/stimulus';
import type { Twist } from '@/lib/tonight/twist';
import { accentFor } from './art';

export function TwistCard({ twist, anchor }: { twist: Twist; anchor: DiagnosticTitle }) {
  const accent = accentFor(anchor.id);

  return (
    <section
      data-testid="tonight-twist"
      data-axis={twist.axis}
      data-anchor={anchor.id}
      aria-label={twist.prompt(anchor)}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl ring-1 ring-white/10"
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(155deg, ${accent}40, rgba(8,11,20,0.97) 65%)` }}
      />

      {/* HELD CONSTANT — the film they already said yes to, unchanged. The
          attributes are listed rather than summarised because "everything else
          stays the same" is a claim, and a player is entitled to see what it
          covers before answering. */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-center p-5">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-400">
          Everything stays the same
        </p>
        <h2 className="mt-1 text-balance text-2xl font-black leading-[1.05] tracking-tight text-white sm:text-4xl">
          {anchor.title}{' '}
          <span className="text-base font-semibold text-slate-400 sm:text-xl">({anchor.year})</span>
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {hookParts(anchor).map((c) => (
            <li
              key={c}
              className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm font-bold text-slate-200 ring-1 ring-white/10 sm:text-base"
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* THE ONE VARIABLE. Visually separated because that separation IS the
          mechanism — a reader who cannot tell what moved cannot answer it. */}
      <div className="relative border-t border-amber-300/25 bg-amber-400/10 p-5">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-amber-300">
          Except one thing
        </p>
        <p
          data-testid="tonight-twist-change"
          className="mt-1 text-balance text-xl font-black leading-tight tracking-tight text-white sm:text-3xl"
        >
          {twist.change}
        </p>
      </div>
    </section>
  );
}
