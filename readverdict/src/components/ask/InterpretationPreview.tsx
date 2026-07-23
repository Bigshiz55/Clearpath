'use client';

import { useState } from 'react';
import { InterpretationChip } from '@/components/ui/InterpretationChip';
import { Chip } from '@/components/ui/Chip';

interface Interp {
  id: string;
  label: string;
  tone: 'brass' | 'signal' | 'negative';
}

const SEED: Interp[] = [
  { id: 'genre', label: 'Psychological thriller', tone: 'brass' },
  { id: 'pages', label: 'Under 350 pages', tone: 'signal' },
  { id: 'pace', label: 'Fast pacing', tone: 'signal' },
  { id: 'standalone', label: 'Standalone', tone: 'brass' },
  { id: 'nosupernatural', label: 'No supernatural', tone: 'negative' },
  { id: 'audiobook', label: 'Audiobook available', tone: 'signal' },
];

/**
 * A live, editable demonstration of how ReadVerdict shows what it understood.
 * Toggle a chip to mute a constraint, or remove it entirely. This is an
 * interaction preview — the real parser and results arrive in Phase 4.
 */
export function InterpretationPreview() {
  const [chips, setChips] = useState<Interp[]>(SEED);
  const [muted, setMuted] = useState<Set<string>>(new Set());

  const remove = (id: string) => {
    setChips((c) => c.filter((x) => x.id !== id));
    setMuted((m) => {
      const next = new Set(m);
      next.delete(id);
      return next;
    });
  };

  const toggle = (id: string) =>
    setMuted((m) => {
      const next = new Set(m);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setChips(SEED);
    setMuted(new Set());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.length === 0 ? (
          <Chip tone="neutral">All constraints cleared</Chip>
        ) : (
          chips.map((c) => (
            <InterpretationChip
              key={c.id}
              label={c.label}
              tone={c.tone}
              muted={muted.has(c.id)}
              onToggle={() => toggle(c.id)}
              onRemove={() => remove(c.id)}
            />
          ))
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-ivory-400">
        <span>Tap a chip to mute it · × to remove.</span>
        {(chips.length !== SEED.length || muted.size > 0) && (
          <button
            type="button"
            onClick={reset}
            className="link-quiet focus:outline-none focus-visible:ring-2 focus-visible:ring-brass-300"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
