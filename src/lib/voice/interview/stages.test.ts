import { describe, it, expect } from 'vitest';
import {
  planDirective,
  currentStage,
  likedGenres,
  GENRE_TRIPLES,
  GENRE_DRILL,
  SCRIPT_LENGTH,
  advance,
  createInterview,
  type InterviewState,
  type TasteSignal,
} from './index';

/**
 * THE STAGED SCRIPT, PINNED.
 *
 * The interview must walk a deliberate shape — genre triage → adaptive
 * drill-down → viewing preferences → title anchors → wrap — while the pure engine
 * keeps its guarantees: a contradiction still preempts, completion/turn-cap still
 * terminates, and the script always finishes in a bounded number of turns.
 */

function fresh(): InterviewState {
  return createInterview('u-test', 1000);
}

/** Feed one answer through the engine using the scripted directive, like the server does. */
function answer(state: InterviewState, signals: TasteSignal[]): InterviewState {
  return advance(state, signals, state.updatedAtMs + 1000, planDirective(state));
}

function genreSignal(subject: string, turn: number): TasteSignal {
  return {
    id: `g:${turn}`,
    turn,
    kind: 'genre',
    subject,
    sentiment: 'love',
    strength: 0.9,
    categories: [],
    raw: `I love ${subject}`,
  };
}

describe('Stage 1 — rapid-fire grouped genre triples', () => {
  it('opens on genre triage and the first line greets + poses the first triple', () => {
    const s = fresh();
    expect(currentStage(s)).toBe('genre_triage');
    const d = planDirective(s);
    expect(d.done).toBe(false);
    // Every genre in the first triple is named in the opening line.
    for (const g of GENRE_TRIPLES[0]!) expect(d.suggestedLine.toLowerCase()).toContain(g);
  });

  it('poses all four triples across the first four turns, in order', () => {
    let s = fresh();
    for (let i = 0; i < GENRE_TRIPLES.length; i++) {
      expect(currentStage(s)).toBe('genre_triage');
      const line = planDirective(s).suggestedLine.toLowerCase();
      for (const g of GENRE_TRIPLES[i]!) expect(line).toContain(g);
      s = answer(s, [genreSignal(GENRE_TRIPLES[i]![0], s.turn + 1)]);
    }
    // After the four triples we leave triage.
    expect(currentStage(s)).not.toBe('genre_triage');
  });
});

describe('Stage 2 — adaptive drill-down', () => {
  it('drills into the genre the user leaned into hardest during triage', () => {
    let s = fresh();
    // Answer the four triage triples; crime is the strongest (love, 0.95).
    s = answer(s, [{ ...genreSignal('crime', 1), strength: 0.95, categories: ['crime', 'genres'] }]);
    s = answer(s, [{ ...genreSignal('romance', 2), strength: 0.5, categories: ['romance', 'genres'] }]);
    s = answer(s, [{ ...genreSignal('thriller', 3), strength: 0.4, categories: ['psychologicalThrillers', 'genres'] }]);
    s = answer(s, [{ ...genreSignal('mystery', 4), strength: 0.3, categories: ['mystery', 'genres'] }]);
    expect(currentStage(s)).toBe('drill_down');
    expect(planDirective(s).suggestedLine).toBe(GENRE_DRILL.crime);
  });

  it('likedGenres ranks by strength then recency and dedupes', () => {
    let s = fresh();
    s = answer(s, [{ ...genreSignal('comedy', 1), strength: 0.6, categories: ['comedyTolerance', 'genres'] }]);
    s = answer(s, [{ ...genreSignal('horror', 2), strength: 0.9, categories: ['horrorTolerance', 'genres'] }]);
    const ranked = likedGenres(s);
    expect(ranked[0]?.key).toBe('horror');
  });

  it('falls back to a graceful generic drill when triage named nothing known', () => {
    let s = fresh();
    // Four empty answers — no derivable genre.
    for (let i = 0; i < 4; i++) s = answer(s, []);
    expect(currentStage(s)).toBe('drill_down');
    expect(planDirective(s).suggestedLine.length).toBeGreaterThan(0);
  });
});

describe('Stages 3 & 4 — viewing preferences then title anchors', () => {
  it('reaches viewing_prefs then title_anchors as the script advances', () => {
    let s = fresh();
    const stagesSeen: string[] = [];
    for (let i = 0; i < SCRIPT_LENGTH; i++) {
      stagesSeen.push(currentStage(s));
      s = answer(s, []);
    }
    expect(stagesSeen).toContain('viewing_prefs');
    expect(stagesSeen).toContain('title_anchors');
    // Order: last viewing_prefs index precedes first title_anchors index.
    const lastPrefs = stagesSeen.lastIndexOf('viewing_prefs');
    const firstAnchor = stagesSeen.indexOf('title_anchors');
    expect(lastPrefs).toBeLessThan(firstAnchor);
  });
});

describe('termination + engine preemption', () => {
  it('completes cleanly once the script is spent (done: true)', () => {
    let s = fresh();
    for (let i = 0; i < SCRIPT_LENGTH; i++) s = answer(s, []);
    expect(currentStage(s)).toBe('wrap');
    const d = planDirective(s);
    expect(d.action).toBe('complete');
    expect(d.done).toBe(true);
  });

  it('a live contradiction preempts the script (challenge)', () => {
    let s = fresh();
    // "hate horror" then "loved The Silence of the Lambs" → category_vs_title.
    s = answer(s, [
      { id: 'h', turn: 1, kind: 'genre', subject: 'horror', sentiment: 'hate', strength: 0.9, categories: ['horrorTolerance', 'genres'], raw: 'I hate horror' },
    ]);
    s = answer(s, [
      { id: 't', turn: 2, kind: 'title', subject: 'The Silence of the Lambs', sentiment: 'love', strength: 0.95, categories: ['horrorTolerance', 'crime', 'psychologicalThrillers', 'mystery'], raw: 'loved Silence of the Lambs' },
    ]);
    const d = planDirective(s);
    expect(d.action).toBe('challenge');
    expect(d.contradiction).not.toBeNull();
  });

  it('never runs past the hard turn cap — always terminates', () => {
    let s = fresh();
    // Drive well past the script with empty turns; must end done.
    for (let i = 0; i < 40; i++) {
      const d = planDirective(s);
      if (d.done) return; // terminated
      s = answer(s, []);
    }
    expect(planDirective(s).done).toBe(true);
  });
});
