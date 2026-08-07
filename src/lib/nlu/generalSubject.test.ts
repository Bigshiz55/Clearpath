import { describe, it, expect } from 'vitest';
import { detectGeneralSubject, isSingularSubjectRequest } from './requiredSubject';

describe('detectGeneralSubject — arbitrary subjects from the user’s own words', () => {
  const cases: Array<[string, string, string[]]> = [
    ['a courtroom movie where the trial is central.', 'courtroom', ['courtroom', 'trial']],
    ['Show me a detective series, not just a generic crime show.', 'detective', ['detective']],
    ['a Christmas movie where Christmas matters to the story.', 'christmas', ['christmas']],
    ['a medical drama centered on hospital work.', 'medical', ['medical', 'hospital']],
    ['a heist movie where planning and executing the theft drives the plot.', 'heist', ['heist', 'theft']],
    ['a serial killer series centered on the investigation.', 'serial killer', ['serial killer', 'killer', 'investigation']],
    ['a journalism movie about reporting.', 'journalism', ['journalism', 'reporting']],
    ['a chess movie where chess drives the story.', 'chess', ['chess']],
    ['a mountaineering movie centered on the climb.', 'mountaineering', ['mountaineering', 'climb']],
    ['a political campaign movie centered on the election.', 'political campaign', ['political campaign', 'campaign', 'election']],
  ];

  for (const [text, canonical, expectedLexemes] of cases) {
    it(`extracts "${canonical}" from: ${text}`, () => {
      const g = detectGeneralSubject(text);
      expect(g).not.toBeNull();
      expect(g!.canonical).toBe(canonical);
      for (const lex of expectedLexemes) {
        expect(g!.lexemes).toContain(lex);
      }
    });
  }

  it('does NOT fire on a plain genre browse ("crime shows")', () => {
    expect(detectGeneralSubject('show me some crime shows')).toBeNull();
    expect(detectGeneralSubject('three good thrillers')).toBeNull();
  });

  it('does NOT treat a provider / language / quality word as a subject', () => {
    expect(detectGeneralSubject('a Netflix movie')).toBeNull();
    expect(detectGeneralSubject('a Spanish film')).toBeNull();
    expect(detectGeneralSubject('a great movie')).toBeNull();
    expect(detectGeneralSubject('a good film under two hours')).toBeNull();
  });

  it('does NOT treat a leading temporal/availability filler as a subject', () => {
    // Regression: "Anytime movies where the primary language is not English…"
    // made "anytime" a strict "Anytime" subject that no title is central to,
    // clearing every result. A recency filler is never the content subject.
    expect(detectGeneralSubject("Anytime movies where the primary language is not English, but it's English dubbed")).toBeNull();
    expect(detectGeneralSubject('anytime movies on my services')).toBeNull();
    expect(detectGeneralSubject('whenever films that are funny')).toBeNull();
  });
});

describe('isSingularSubjectRequest — the requested-count = 1 signal', () => {
  it('is true for a singular indefinite subject request', () => {
    expect(isSingularSubjectRequest("Find me a boxing movie that I would like that's been made within the last 20 years")).toBe(true);
    expect(isSingularSubjectRequest('a courtroom film')).toBe(true);
    expect(isSingularSubjectRequest('a chess movie where chess drives the story')).toBe(true);
  });

  it('is false for plurals and explicit counts', () => {
    expect(isSingularSubjectRequest('boxing movies')).toBe(false);
    expect(isSingularSubjectRequest('three courtroom films')).toBe(false);
    expect(isSingularSubjectRequest('show me detective shows')).toBe(false);
  });
});
