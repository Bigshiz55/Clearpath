import Link from 'next/link';

/**
 * THE TWO WAYS TO TAKE THE TASTE QUIZ.
 *
 * They are not competing features, they are complementary instruments, and the
 * switch says which is which rather than making people guess:
 *
 *   STATEMENTS — fast, and it works whether or not you can remember titles.
 *     Broad coverage, abstract evidence.
 *   TITLES     — slower, and only works on things you recognise, but a real
 *     reaction to a real film is harder evidence than any statement.
 *
 * Keeping them under one heading is the point: "I did the quiz" should mean one
 * thing, and the second instrument should look like more of the same exercise
 * rather than a different feature someone has to go and find.
 */
export type QuizMode = 'statements' | 'titles';

const MODES: Array<{ key: QuizMode; label: string; hint: string }> = [
  { key: 'statements', label: 'Statements', hint: 'About 2 minutes' },
  { key: 'titles', label: 'Real titles', hint: 'React to what you know' },
];

export function TasteQuizModes({ active, sessionId }: { active: QuizMode; sessionId?: string | undefined }) {
  const qs = (m: QuizMode) => {
    const p = new URLSearchParams({ mode: m });
    if (sessionId) p.set('session', sessionId);
    return `/app/taste-quiz?${p.toString()}`;
  };

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Taste Quiz mode" data-testid="quiz-modes">
      {MODES.map((m) => {
        const on = m.key === active;
        return (
          <Link
            key={m.key}
            href={qs(m.key)}
            aria-current={on ? 'page' : undefined}
            data-testid={`quiz-mode-${m.key}`}
            className={[
              'inline-flex min-h-[44px] flex-col justify-center rounded-lg border px-3 py-1.5 transition',
              on
                ? 'border-brand-400/60 bg-brand-500/20 text-white'
                : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10',
            ].join(' ')}
          >
            <span className="text-sm font-bold leading-tight">{m.label}</span>
            <span className="text-[10px] leading-tight text-slate-400">{m.hint}</span>
          </Link>
        );
      })}
      {/* The third way in is a different kind of act — you are handing over data
          rather than answering anything — so it is a link, not a third tab. */}
      <Link
        href="/import-taste"
        data-testid="quiz-mode-import"
        className="ml-1 text-xs font-semibold text-brand-300 underline underline-offset-2 hover:text-brand-200"
      >
        Or import your history →
      </Link>
    </nav>
  );
}
