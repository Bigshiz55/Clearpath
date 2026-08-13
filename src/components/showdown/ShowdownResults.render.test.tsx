import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShowdownResults } from './ShowdownResults';
import type { ShowdownPayoff } from '@/lib/actions/showdown';
import { createSession, startSession, answer, type ShowdownState } from '@/lib/showdown/session';

/**
 * WHAT THE RESULTS SCREEN IS ALLOWED TO SAY.
 *
 * `/app/showdown` is behind the auth gate and the payoff only exists for a
 * signed-in player, so neither the Playwright harness nor an anonymous HTTP
 * request can ever see this section. Rendering it proves what a signed-in
 * player actually receives.
 *
 * THE THREE OUTCOMES ARE THE POINT. A results screen that congratulates you
 * whatever happened is the thing this whole rebuild is against, and the two
 * "no" cases are the ones worth pinning, because they are the ones a future
 * edit is tempted to soften:
 *
 *   payoff null       nobody measured. Say nothing about the real ranking.
 *   movement 0        measured, and it did not cross the ranker's floor.
 *   movement > 0      measured, and here is what moved.
 */

function playedSession(): ShowdownState {
  let s = startSession(createSession({}, 0, 'dna'), 0);
  for (let i = 0; i < 6 && s.current; i++) {
    s = answer(s, i % 2 === 0 ? 'left' : 'right', 1000 * (i + 1), 900);
  }
  return s;
}

function render(payoff: ShowdownPayoff | null) {
  const state = playedSession();
  return renderToStaticMarkup(
    <ShowdownResults
      state={state}
      openingKnown={0}
      payoff={payoff}
      onPlayAgain={() => {}}
      onContinue={() => {}}
    />,
  );
}

const ROW = { id: 'movie-1', title: 'A Real Film', year: 2019, was: 9, now: 2, moved: 7 };

describe('the real-ranking payoff', () => {
  it('says NOTHING about real recommendations until the server has measured', () => {
    /* A guest never gets this section at all, and neither does a signed-in
       player in the second before the answer arrives. Anything printed here
       would be a claim made with no measurement behind it. */
    const html = render(null);
    expect(html).not.toContain('Your real recommendations');
    expect(html).not.toContain('showdown-payoff');
  });

  it('states plainly that nothing moved when nothing moved', () => {
    const html = render({ measured: true, movement: 0, top: [], climbed: [] });
    expect(html).toContain('data-testid="showdown-payoff"');
    expect(html).toContain('data-movement="0"');
    expect(html).toContain('hasn’t changed yet');
    // And it does NOT dress the absence up as a result.
    expect(html).not.toContain('climbed into your top');
    expect(html).not.toContain('↑');
  });

  it('names the titles that climbed, with how far', () => {
    const html = render({
      measured: true,
      movement: 24,
      top: [ROW, { id: 'movie-2', title: 'Another Film', year: null, was: 1, now: 1, moved: 0 }],
      climbed: [ROW],
    });
    expect(html).toContain('data-movement="24"');
    expect(html).toContain('A Real Film');
    expect(html).toContain('(2019)');
    expect(html).toContain('1 title climbed into your top 2');
    expect(html).toContain('↑7');
    // A title that held its place gets no arrow — an arrow is a claim.
    expect(html).toContain('Another Film');
    expect((html.match(/↑/g) ?? []).length).toBe(1);
  });

  it('a year we do not have is omitted rather than guessed', () => {
    const html = render({
      measured: true,
      movement: 3,
      top: [{ id: 'movie-3', title: 'Undated', year: null, was: 4, now: 2, moved: 2 }],
      climbed: [],
    });
    expect(html).toContain('Undated');
    expect(html).not.toContain('(null)');
  });

  it('keeps the diagnostic list clearly labelled as the GAME’S catalogue', () => {
    /* The two sections make different claims and must never read as one. The
       lower list is the 113-title instrument scored by Showdown's own model;
       calling it a recommendation is the overclaim this replaced. */
    const html = render({ measured: true, movement: 12, top: [ROW], climbed: [ROW] });
    expect(html).toContain('Closest matches in the game’s catalogue');
    expect(html).toContain('Your real recommendations');
    expect(html.indexOf('Your real recommendations')).toBeLessThan(
      html.indexOf('Closest matches in the game’s catalogue'),
    );
  });
});
