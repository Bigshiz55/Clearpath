/**
 * DETERMINISTIC SUBJECT SELF-TEST — the founder's offline red-team, runnable
 * with no TMDB or OpenAI key.
 *
 * This is the interactive, in-app cousin of the exhaustive `eval/redteam`
 * audit. It runs the REAL `evaluateSubjectCentrality` (the same function the
 * production finder uses) over a small frozen corpus of central titles and
 * controlled decoys whose ground-truth centrality is authored here BY HAND,
 * independent of the evaluator. Because it is pure and self-contained it works
 * on any deployment — the founder can prove the Snake-Eyes class of failure is
 * rejected without spending a single upstream API call.
 *
 * It intentionally does NOT import the eval/ harness: production code must not
 * depend on the test scaffolding, and this spot-check has a different job (a
 * fast, bounded, in-browser proof) than the 200k-case offline audit.
 *
 * Modes:
 *   • regression — the exact production-failure sentence and its exact wrong
 *     answer (Snake Eyes). Frozen; must always pass.
 *   • random     — N seeded cases from the generator below. Reproducible.
 *   • seed       — the same, for a caller-supplied seed (reproduce a failure).
 */

import { evaluateSubjectCentrality, type SubjectRequirement } from './semanticEligibility';

export type CentralityTruth = 'central' | 'incidental' | 'absent';

interface SelfTestCandidate {
  title: string;
  overview: string;
  genres: string[];
  keywords: string[];
  truth: CentralityTruth;
}

interface SelfTestSubject {
  requirement: SubjectRequirement;
  central: SelfTestCandidate[];
  decoys: SelfTestCandidate[];
}

const cand = (
  title: string,
  overview: string,
  keywords: string[],
  genres: string[],
  truth: CentralityTruth,
): SelfTestCandidate => ({ title, overview, keywords, genres, truth });

/**
 * The exact live failure, frozen. "Give me three boxing movies that I would
 * like." returned Snake Eyes (1998) — boxing is the SETTING of one scene, not
 * the subject. The three central titles are canonical boxing films.
 */
export const BOXING_REGRESSION_SUBJECT: SelfTestSubject = {
  requirement: {
    canonical: 'boxing',
    label: 'Boxing',
    lexemes: ['boxing', 'boxer', 'prizefighter', 'prizefighting', 'heavyweight', 'ring', 'knockout', 'boxing match'],
    strict: true,
  },
  central: [
    cand('Creed', 'The former World Heavyweight Champion Rocky Balboa serves as a trainer and mentor to Adonis Johnson, a rising boxer chasing the title in his first professional fights.', ['boxing', 'boxer', 'sport'], ['Drama'], 'central'),
    cand('The Fighter', 'The story of boxer Micky Ward and his brother Dicky, a former boxer turned trainer, on his hard road through the ring to a championship title shot.', ['boxing', 'boxer'], ['Drama'], 'central'),
    cand('Million Dollar Baby', 'A determined waitress works with a hardened boxing trainer to become a professional boxer, fighting her way up through the ring toward a title.', ['boxing', 'boxer'], ['Drama'], 'central'),
    cand('Cinderella Man', 'During the Great Depression, common-man heavyweight boxer James J. Braddock makes an improbable comeback in the ring to fight for the championship.', ['boxing', 'boxer', 'heavyweight'], ['Drama', 'History'], 'central'),
  ],
  decoys: [
    cand('Snake Eyes', 'Corrupt cop Rick Santoro is at an Atlantic City boxing match when the Secretary of Defense is assassinated beside him, and he uncovers a sprawling conspiracy.', ['conspiracy', 'assassination', 'boxing', 'casino'], ['Crime', 'Thriller', 'Mystery'], 'incidental'),
    cand('Pulp Fiction', 'The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.', ['hitman', 'boxer', 'crime'], ['Thriller', 'Crime'], 'incidental'),
    cand('The Big Bang', 'A private investigator searches for a missing dancer and a fortune in diamonds in a violent neo-noir mystery.', ['private detective', 'noir'], ['Thriller', 'Mystery'], 'absent'),
  ],
};

/** A compact multi-domain corpus so the random audit proves generalization,
 *  not a boxing patch. Decoys keep the subject out of the TITLE (the Snake-Eyes
 *  class puts it only in the overview, as a setting/former role/metaphor). */
const SELFTEST_CORPUS: SelfTestSubject[] = [
  BOXING_REGRESSION_SUBJECT,
  {
    requirement: { canonical: 'courtroom', label: 'Courtroom', lexemes: ['courtroom', 'trial', 'court', 'attorney', 'lawyer', 'jury', 'verdict'], strict: true },
    central: [
      cand('A Few Good Men', 'A military lawyer defends two Marines in a court-martial; the sustained drama is the courtroom trial and the testimony that cracks the case.', ['courtroom', 'trial', 'military'], ['Drama'], 'central'),
      cand('A Time to Kill', 'A young attorney mounts a courtroom defense in a racially charged murder trial, and the jury deliberation drives the film.', ['courtroom', 'trial', 'lawyer'], ['Drama', 'Crime'], 'central'),
    ],
    decoys: [
      cand('The Setup', 'A fast-talking man briefly appears in one court scene before a heist spins his life out of control across a single night.', ['heist', 'comedy'], ['Comedy'], 'incidental'),
      cand('Kangaroo Jack', 'Two friends travel to the Australian outback to deliver mob money and end up chasing a wild kangaroo.', ['australia', 'kangaroo'], ['Comedy', 'Adventure'], 'absent'),
    ],
  },
  {
    requirement: { canonical: 'chess', label: 'Chess', lexemes: ['chess', 'chessboard', 'grandmaster', 'checkmate'], strict: true },
    central: [
      cand("The Queen's Gambit", 'An orphaned chess prodigy rises through competitive chess to become a grandmaster; the sustained story is her chess career and rivalries.', ['chess', 'prodigy'], ['Drama'], 'central'),
    ],
    decoys: [
      cand('The Long Game', 'A ruthless senator treats the campaign like a game of chess, out-maneuvering rivals in a metaphorical battle for power.', ['politics', 'election'], ['Drama'], 'incidental'),
      cand('The Karate Kid', 'A bullied teenager learns karate from a wise handyman to defend himself and win a tournament.', ['karate', 'coming of age'], ['Drama', 'Family'], 'absent'),
    ],
  },
  {
    requirement: { canonical: 'submarine', label: 'Submarine', lexemes: ['submarine', 'sub', 'periscope', 'torpedo', 'depth charge', 'u boat'], strict: true },
    central: [
      cand('Das Boot', 'The claustrophobic voyage of a German U-boat crew; the entire film is life aboard the submarine under depth-charge attack.', ['submarine', 'u boat', 'war'], ['Drama', 'War'], 'central'),
    ],
    decoys: [
      cand('Yellow Afternoon', 'A family road trip goes sideways; a toy submarine in a bathtub appears in a single childhood flashback.', ['family', 'road trip'], ['Comedy'], 'incidental'),
    ],
  },
];

/** mulberry32 — deterministic PRNG so any run reproduces from its seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SelfTestCaseResult {
  caseId: string;
  subject: string;
  request: string;
  passed: boolean;
  falsePositives: string[]; // decoys wrongly eligible
  falseNegatives: string[]; // central titles wrongly rejected
}

export interface SelfTestSummary {
  mode: 'regression' | 'random' | 'seed';
  seed: number | null;
  cases: number;
  passed: number;
  passRate: number; // 0..1
  decoyLeaks: number; // cases with >=1 false positive (zero-tolerance)
  falseNegativeCases: number;
  failures: SelfTestCaseResult[]; // bounded sample
  reproduce: string; // human-readable repro instruction
  allGreen: boolean;
}

const VERB = ['Give me', 'Show me', 'Find me', 'I want', 'Need'];
const NUM = ['one', 'two', 'three', 'four', 'five'];

function judgeSubject(subject: SelfTestSubject, requestLabel: string, caseId: string): SelfTestCaseResult {
  const pool = [...subject.central, ...subject.decoys];
  const truth = new Set(pool.filter((c) => c.truth === 'central').map((c) => c.title));
  const eligible = new Set<string>();
  for (const c of pool) {
    const v = evaluateSubjectCentrality(subject.requirement, {
      title: c.title,
      overview: c.overview,
      genres: c.genres,
      keywords: c.keywords,
    });
    if (v.status === 'PASS') eligible.add(c.title);
  }
  const falsePositives = [...eligible].filter((t) => !truth.has(t));
  const falseNegatives = [...truth].filter((t) => !eligible.has(t));
  return {
    caseId,
    subject: subject.requirement.label,
    request: requestLabel,
    passed: falsePositives.length === 0 && falseNegatives.length === 0,
    falsePositives,
    falseNegatives,
  };
}

/** Run the deterministic self-test. Pure; no I/O. `cases` is bounded by the
 *  caller (the route caps it) so an in-browser click can never spin forever. */
export function runSubjectSelfTest(opts: {
  mode: 'regression' | 'random' | 'seed';
  seed?: number;
  cases?: number;
}): SelfTestSummary {
  const results: SelfTestCaseResult[] = [];

  if (opts.mode === 'regression') {
    // The exact frozen sentence + its exact wrong answer.
    results.push(
      judgeSubject(BOXING_REGRESSION_SUBJECT, 'Give me three boxing movies that I would like.', 'regression:boxing'),
    );
  } else {
    const seed = opts.seed ?? 1337;
    const n = Math.max(1, opts.cases ?? 100);
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const subject = SELFTEST_CORPUS[Math.floor(r() * SELFTEST_CORPUS.length) % SELFTEST_CORPUS.length]!;
      const verb = VERB[Math.floor(r() * VERB.length) % VERB.length]!;
      const count = NUM[Math.floor(r() * NUM.length) % NUM.length]!;
      const noun = r() < 0.7 ? 'movies' : 'titles';
      const request = `${verb} ${count} ${subject.requirement.label.toLowerCase()} ${noun} that I would like`;
      results.push(judgeSubject(subject, request, `${seed}:${i}`));
    }
  }

  const failures = results.filter((x) => !x.passed);
  const decoyLeaks = results.filter((x) => x.falsePositives.length > 0).length;
  const falseNegativeCases = results.filter((x) => x.falseNegatives.length > 0).length;
  const passed = results.length - failures.length;
  const seedUsed = opts.mode === 'regression' ? null : opts.seed ?? 1337;

  return {
    mode: opts.mode,
    seed: seedUsed,
    cases: results.length,
    passed,
    passRate: results.length === 0 ? 1 : passed / results.length,
    decoyLeaks,
    falseNegativeCases,
    failures: failures.slice(0, 25),
    reproduce:
      opts.mode === 'regression'
        ? 'Immutable regression — see src/lib/nlu/boxingRegression.test.ts'
        : `Reproduce: seed=${seedUsed} cases=${results.length} (deterministic; same seed → same cases)`,
    allGreen: failures.length === 0 && decoyLeaks === 0,
  };
}
