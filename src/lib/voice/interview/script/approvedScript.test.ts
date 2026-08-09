import { describe, it, expect } from 'vitest';
import {
  STAGE1_QUESTIONS,
  STAGE2_QUESTIONS,
  STAGE1_GENRE_KEYS,
  drillDownFor,
  MIN_MEANINGFUL_TURNS,
  DRILL_THRESHOLD,
} from './questionBank';
import { plannedQuestions } from './scriptedInterview';
import { runInterview, typicalAnswerSource, type AnswerSource } from './simulate';

/**
 * THE APPROVED SCRIPT, PINNED VERBATIM.
 *
 * Stage 1 is not a detail — it is the interview. Its twelve genres, grouped
 * four-by-three in this exact order, are what every later stage is computed
 * from, and the answer parser aligns scores POSITIONALLY to the words in each
 * prompt. So a well-meaning edit to a category list silently attaches scores to
 * the wrong genres. That is why the structure is asserted here rather than left
 * to reviewer memory.
 *
 * An earlier revision shipped a different nine-genre Stage 1 (crime/comedy/
 * sci-fi, horror/romance/documentaries, fantasy/war/animation). These tests pin
 * the approved structure so that version cannot quietly return.
 */

const APPROVED_GROUPS: string[][] = [
  ['crime', 'drama', 'comedy'],
  ['romance', 'action', 'thriller'],
  ['horror', 'scifi', 'fantasy'],
  ['animation', 'documentary', 'reality'],
];

describe('Stage 1 is the four approved rapid-fire groups', () => {
  it('has exactly four grouped questions', () => {
    expect(STAGE1_QUESTIONS).toHaveLength(4);
  });

  it('every scored question asks exactly THREE items', () => {
    for (const q of [...STAGE1_QUESTIONS, ...STAGE2_QUESTIONS]) {
      expect(q.items, `${q.id} must ask three items`).toHaveLength(3);
    }
  });

  it('the groups are in the approved order, with the approved genres', () => {
    const actual = STAGE1_QUESTIONS.map((q) => q.items.map((i) => i.key));
    expect(actual).toEqual(APPROVED_GROUPS);
  });

  it('covers twelve distinct genres and no others', () => {
    expect(STAGE1_GENRE_KEYS).toHaveLength(12);
    expect(new Set(STAGE1_GENRE_KEYS).size).toBe(12);
    expect(STAGE1_GENRE_KEYS).toEqual(APPROVED_GROUPS.flat());
  });

  it('does NOT contain the superseded nine-genre arrangement', () => {
    // The old Stage 1 asked crime/comedy/sci-fi together and had a `war` genre.
    const first = STAGE1_QUESTIONS[0]!.items.map((i) => i.key);
    expect(first).not.toEqual(['crime', 'comedy', 'scifi']);
    expect(STAGE1_GENRE_KEYS).not.toContain('war');
  });

  it('opens with the approved gut-check wording, kept short', () => {
    const prompts = STAGE1_QUESTIONS.map((q) => q.prompt);
    expect(prompts[0]).toBe('Quick gut check — crime, drama, comedy. One to ten?');
    expect(prompts[1]).toBe('Romance, action, thriller?');
    expect(prompts[2]).toBe('Horror, sci-fi, fantasy?');
    // "Last three", not "last four" — every scored question asks three items.
    expect(prompts[3]).toBe('Last three — animation, documentaries, reality TV.');
    for (const p of prompts) expect(p.length).toBeLessThanOrEqual(60);
  });

  it('each prompt names its own items, in order', () => {
    for (const q of STAGE1_QUESTIONS) {
      const lower = q.prompt.toLowerCase();
      let cursor = -1;
      for (const item of q.items) {
        const alias = item.aliases.find((a) => lower.includes(a.toLowerCase()));
        expect(alias, `${q.id} prompt never names "${item.key}"`).toBeDefined();
        const at = lower.indexOf(alias!.toLowerCase());
        expect(at, `${q.id}: "${item.key}" is out of order in the prompt`).toBeGreaterThan(cursor);
        cursor = at;
      }
    }
  });
});

describe('Stage 2 matches the approved genres', () => {
  it('crime drills into detective mysteries, psychological crime, true crime', () => {
    const crime = drillDownFor('crime');
    expect(crime).not.toBeNull();
    expect(crime!.prompt).toBe('Crime is strong. Detective mysteries, psychological crime, true crime?');
    expect(crime!.items.map((i) => i.key)).toEqual([
      'detective-mysteries',
      'psychological-crime',
      'true-crime',
    ]);
  });

  it('the newly approved genres have drill-downs where useful', () => {
    for (const genre of ['drama', 'action', 'thriller', 'reality']) {
      expect(drillDownFor(genre), `${genre} has no drill-down`).not.toBeNull();
    }
  });

  it('every drill-down is gated by a genre Stage 1 actually asks about', () => {
    for (const q of STAGE2_QUESTIONS) {
      expect(q.gatedByGenre, `${q.id} has no gate`).toBeDefined();
      expect(
        STAGE1_GENRE_KEYS,
        `${q.id} is gated by "${q.gatedByGenre}", which Stage 1 never scores — it could never fire`,
      ).toContain(q.gatedByGenre!);
    }
  });

  it('no orphaned drill-down survives from the old script', () => {
    expect(STAGE2_QUESTIONS.map((q) => q.id)).not.toContain('s2-war');
  });
});

describe('the interview shape holds with the approved script', () => {
  it('the first four user turns are the four genre triples', () => {
    const run = runInterview(typicalAnswerSource);
    expect(run.askedIds.slice(0, 4)).toEqual(['s1-a', 's1-b', 's1-c', 's1-d']);
    for (const t of run.turns.slice(0, 4)) expect(t.stage).toBe(1);
  });

  it('title anchors remain last', () => {
    const run = runInterview(typicalAnswerSource);
    const firstAnchor = run.askedIds.findIndex((id) => id.startsWith('s4-'));
    const lastNonAnchor = run.askedIds.reduce((acc, id, i) => (id.startsWith('s4-') ? acc : i), -1);
    expect(firstAnchor).toBeGreaterThan(lastNonAnchor - run.askedIds.filter((i) => i.startsWith('s4-')).length);
    expect(firstAnchor).toBeGreaterThan(3);
    expect(run.askedIds[run.askedIds.length - 1]!.startsWith('s4-')).toBe(true);
  });

  it('reaches at least eight meaningful turns even with no drill-downs earned', () => {
    const flat: AnswerSource = (q) => (q.kind === 'anchor' ? 'nothing really' : '2, 2, 2');
    const run = runInterview(flat);
    expect(run.drilledGenres).toEqual([]);
    expect(run.meaningfulTurns).toBeGreaterThanOrEqual(MIN_MEANINGFUL_TURNS);
    // Four triples + three style + two anchors.
    expect(run.meaningfulTurns).toBe(9);
  });

  it('high-scoring genres change Stage 2', () => {
    const crimey = runInterview(typicalAnswerSource);
    const horror: AnswerSource = (q) =>
      ({ 's1-a': '1, 2, 3', 's1-b': '2, 1, 2', 's1-c': '10, 2, 1', 's1-d': '1, 2, 1' })[q.id] ?? '2, 2, 2';
    const horrorRun = runInterview(horror);
    expect(crimey.drilledGenres).toContain('crime');
    expect(horrorRun.drilledGenres).toEqual(['horror']);
    expect(horrorRun.drilledGenres).not.toContain('crime');
  });

  it('low-scoring genres are never drilled', () => {
    const run = runInterview(typicalAnswerSource);
    for (const [genre, score] of Object.entries(run.progress.genreScores)) {
      if (score < DRILL_THRESHOLD) expect(run.drilledGenres).not.toContain(genre);
    }
    // Concretely: this user scored romance 2 and reality 1.
    expect(run.drilledGenres).not.toContain('romance');
    expect(run.drilledGenres).not.toContain('reality');
  });

  it('plans stage 1 before stage 2 before stage 3 before stage 4', () => {
    const stages = plannedQuestions({
      answeredIds: [],
      genreScores: { crime: 10, thriller: 9 },
      anchors: [],
    }).map((q) => q.stage);
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
  });
});
