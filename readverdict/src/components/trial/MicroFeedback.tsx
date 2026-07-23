'use client';

// Lightweight, optional micro-feedback shown after a verdict action. Part of the
// courtroom framing ("submit evidence") and the behavioral-data loop — never a
// long survey, always skippable.

const PROMPTS: Record<string, { q: string; options: { value: string; label: string }[] }> = {
  save: {
    q: 'What mattered most?',
    options: [
      { value: 'pacing', label: 'Pacing' },
      { value: 'premise', label: 'Premise' },
      { value: 'length', label: 'Length' },
      { value: 'format', label: 'Format' },
      { value: 'match', label: 'The match score' },
    ],
  },
  start: {
    q: 'What convinced you?',
    options: [
      { value: 'defense', label: 'The defense' },
      { value: 'match', label: 'The match' },
      { value: 'availability', label: 'It’s available' },
      { value: 'mood', label: 'My mood' },
    ],
  },
  pass: {
    q: 'Why are you dismissing it?',
    options: [
      { value: 'pacing', label: 'Pacing' },
      { value: 'length', label: 'Too long' },
      { value: 'content', label: 'Content' },
      { value: 'not_mood', label: 'Not my mood' },
      { value: 'already_read', label: 'Already read it' },
    ],
  },
};

export function MicroFeedback({
  kind,
  onPick,
}: {
  kind: 'save' | 'pass' | 'start';
  onPick: (reason: string) => void;
}) {
  const prompt = PROMPTS[kind]!;
  return (
    <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
      <p className="mb-2 text-xs font-medium text-ivory-300">{prompt.q}</p>
      <div className="flex flex-wrap gap-1.5">
        {prompt.options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className="rounded-full border border-ink-600 bg-ink-850 px-2.5 py-1 text-xs text-ivory-200 transition hover:border-copper-400 hover:text-copper-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-copper-300"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
