'use client';

/**
 * "WE CAUGHT SOMETHING" — the screen where the game stops asking and tells.
 *
 * This is the moment the whole rebuild is for. Everything else in Showdown is
 * the machine collecting; this is the machine showing its working, in a sentence
 * about the person rather than a percentage about itself. It is also the only
 * screen that can be WRONG in a way the player feels — which is exactly why it
 * is worth showing and exactly why "Not quite" has to be as easy to press as
 * "That's me".
 *
 * NOT QUITE IS NOT A DISMISSAL. It is the highest-value input in the product: a
 * correction from the person themselves, contradicting something the engine had
 * already become confident enough about to say out loud. Making it the quiet
 * secondary button would be optimising for the engine's ego over the profile's
 * accuracy, so both answers get the same weight on screen.
 */

import type { Discovery } from '@/lib/showdown/discovery';

export function DiscoveryCard({
  discovery,
  evidence,
  onConfirm,
  onCorrect,
}: {
  discovery: Discovery;
  /**
   * The counted receipt — "3 times you chose it that way." NULL when fewer than
   * two decisions support the claim, and then nothing is shown rather than a
   * rounded-up number on the one screen whose entire job is credibility.
   */
  evidence?: string | null;
  onConfirm: () => void;
  onCorrect: () => void;
}) {
  return (
    <div
      data-testid="showdown-discovery"
      data-discovery-id={discovery.id}
      className="flex min-h-0 flex-1 flex-col justify-center gap-6 px-1"
    >
      <div className="text-center">
        <p className="text-[0.6rem] font-black uppercase tracking-[0.3em] text-amber-300">
          We caught something
        </p>
        <p
          data-testid="showdown-discovery-text"
          className="mt-4 text-balance text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl"
        >
          {discovery.text}
        </p>
        {evidence && (
          <p
            data-testid="showdown-discovery-evidence"
            className="mt-3 text-sm font-bold text-slate-400"
          >
            {evidence}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          data-testid="showdown-discovery-confirm"
          onClick={onConfirm}
          className="min-h-[56px] rounded-2xl bg-emerald-400/15 px-3 text-base font-black uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-300/40 transition active:scale-[0.98] active:bg-emerald-400/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          That&rsquo;s me
        </button>
        <button
          type="button"
          data-testid="showdown-discovery-correct"
          onClick={onCorrect}
          className="min-h-[56px] rounded-2xl bg-white/10 px-3 text-base font-black uppercase tracking-wide text-white ring-1 ring-white/15 transition active:scale-[0.98] active:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Not quite
        </button>
      </div>
    </div>
  );
}
