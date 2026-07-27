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
    <nav aria-label="Taste Quiz mode" data-testid="quiz-modes">
      {/* This is the first choice on the screen and it decides what the next two
          minutes look like, so it is sized like a choice rather than a filter
          chip. Brand pink, because that is the colour the product uses for the
          thing it wants you to press. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m) => {
          const on = m.key === active;
          return (
            <Link
              key={m.key}
              href={qs(m.key)}
              aria-current={on ? 'page' : undefined}
              data-testid={`quiz-mode-${m.key}`}
              className={[
                'flex min-h-[74px] flex-col justify-center rounded-2xl border-2 px-5 py-4 transition',
                on
                  ? 'border-pink-300/60 bg-gradient-to-b from-[#ff62b6] to-[#ff1493] text-white shadow-[0_10px_30px_-10px_rgba(255,20,147,0.65)]'
                  : 'border-[#ff1493]/40 bg-[#ff1493]/[0.07] text-pink-100 hover:border-[#ff1493]/70 hover:bg-[#ff1493]/15',
              ].join(' ')}
            >
              <span className="text-lg font-black leading-tight sm:text-xl">{m.label}</span>
              <span className={`mt-0.5 text-sm leading-tight ${on ? 'text-pink-50/90' : 'text-pink-200/70'}`}>
                {m.hint}
              </span>
            </Link>
          );
        })}
      </div>
      {/* The third way in is a different kind of act — you are handing over data
          rather than answering anything — so it is a link, not a third tab. */}
      <Link
        href="/import-taste"
        data-testid="quiz-mode-import"
        className="mt-2 inline-flex min-h-[36px] items-center text-sm font-semibold text-pink-300 underline underline-offset-2 hover:text-pink-200"
      >
        Or import your history →
      </Link>
    </nav>
  );
}
