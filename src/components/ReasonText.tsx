'use client';

import { useState } from 'react';

/** A personalized reason that shows one complete sentence and expands in place
 *  on tap OR click — so mobile (no hover) gets the full text too. Must render
 *  OUTSIDE any surrounding <Link> so this control is valid, interactive markup. */
export function ReasonText({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={`block w-full text-left leading-snug transition ${open ? '' : 'line-clamp-2'} ${className}`}
    >
      {text}
    </button>
  );
}
