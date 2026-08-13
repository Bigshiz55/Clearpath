'use client';

import { ShowdownResults } from '@/components/showdown/ShowdownResults';
import { createSession, startSession, answer, type ShowdownState } from '@/lib/showdown/session';
import type { ShowdownPayoff } from '@/lib/actions/showdown';

/**
 * The client half of the results-screen harness.
 *
 * It exists for one reason: `ShowdownResults` takes callbacks, and a Server
 * Component cannot hand a function to a Client Component. The session is played
 * here by the real engine so the harness never ships a fabricated
 * `ShowdownState` — only the payoff, which is the server's answer and is the
 * thing being looked at.
 */
function played(): ShowdownState {
  let s = startSession(createSession({}, 0, 'dna'), 0);
  for (let i = 0; i < 14 && s.current; i++) {
    s = answer(s, i % 3 === 0 ? 'right' : 'left', 1000 * (i + 1), 850);
  }
  return s;
}

export function PayoffViewer({ payoff }: { payoff: ShowdownPayoff | null }) {
  return (
    <ShowdownResults
      state={played()}
      openingKnown={0}
      payoff={payoff}
      onPlayAgain={() => {}}
      onContinue={() => {}}
    />
  );
}
