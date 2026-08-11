'use client';

/**
 * ONE TITLE, WITH THE THING THAT MAKES IT ANSWERABLE.
 *
 * The hook is not decoration. A poster alone asks "do you recognise this?",
 * which is a memory test; the hook turns it into "knowing what this is, do you
 * want it?", which is the question the product actually needs answered — and
 * the only version an unfamiliar title can survive.
 *
 * ARTWORK CANNOT BREAK THE PRODUCT, AND ITS ABSENCE IS NOT A HOLE. The first
 * fallback reserved poster space and left the top half of a phone as empty
 * gradient, which reads as a failed image however deliberate the colour is. So
 * when there is no artwork the card is not a poster with the picture missing —
 * it is a different, complete composition: the title set large, with the film's
 * defining attributes as chips.
 *
 * Those chips are the hook decomposed, from the same trait vector, so they are
 * accurate by construction and cannot drift from the sentence a screen reader
 * is given. Nothing here is invented to fill space.
 */

import { useState } from 'react';
import { hookParts, type Stimulus } from '@/lib/tonight/stimulus';
import { accentFor } from './art';

export function StimulusCard({ stimulus, artUrl }: { stimulus: Stimulus; artUrl?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showArt = Boolean(artUrl) && !failed;
  const accent = accentFor(stimulus.title.id);
  const chips = hookParts(stimulus.title);

  return (
    <section
      data-testid="tonight-stimulus"
      data-title-id={stimulus.title.id}
      data-has-art={showArt ? 'true' : 'false'}
      aria-label={`${stimulus.title.title} (${stimulus.title.year}). ${stimulus.hook}.`}
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl ring-1 ring-white/10 ${
        showArt ? 'justify-end' : 'justify-center'
      }`}
    >
      {showArt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artUrl!}
          alt={`Poster for ${stimulus.title.title}`}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(155deg, ${accent}40, rgba(8,11,20,0.97) 65%)` }}
        />
      )}
      {showArt && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5"
          style={{ background: 'linear-gradient(to top, rgba(4,7,15,0.96), transparent)' }}
        />
      )}

      {/* Scrolls within the card on a short screen rather than growing the page
          and pushing the answers below the fold. */}
      <div className="relative min-h-0 overflow-y-auto p-5">
        <h2 className="text-balance text-3xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">
          {stimulus.title.title}
        </h2>
        <p className="mt-1 text-sm font-semibold text-slate-400">{stimulus.title.year}</p>

        {showArt ? (
          <p
            data-testid="tonight-hook"
            className="mt-3 text-balance text-base font-semibold leading-snug text-amber-200 sm:text-lg"
          >
            {stimulus.hook}
          </p>
        ) : (
          // Over artwork a sentence sits better on a busy image; with no image
          // the chips read faster and carry the same three facts.
          <ul data-testid="tonight-hook" className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => (
              <li
                key={c}
                className="rounded-full px-3 py-1.5 text-sm font-bold text-amber-100 ring-1 ring-amber-300/30 sm:text-base"
                style={{ background: `${accent}26` }}
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
