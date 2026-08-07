/**
 * SEMANTIC RED-TEAM — frozen subject corpus + controlled decoy templates.
 *
 * This is the independent ORACLE. Each candidate here is authored with a
 * ground-truth centrality label BY HAND, separate from the production evaluator
 * logic, so a test can check whether the evaluator's verdict matches an
 * independent judgement rather than grading itself. Decoys encode the exact
 * failure classes seen in production and in the spec: a setting mention
 * (Snake Eyes), a former occupation, a single scene, a metaphor, a misleading
 * keyword, and pure absence.
 *
 * Metadata is representative of real TMDB records (short overview + keyword
 * tags + genres). No per-title logic — this feeds the subject-agnostic
 * evaluator via lexemes only.
 */

export type Truth = 'central' | 'substantial' | 'incidental' | 'absent';

export interface Candidate {
  title: string;
  overview: string;
  genres: string[];
  keywords: string[];
  truth: Truth;
}

export interface SubjectCorpus {
  canonical: string;
  label: string;
  lexemes: string[];
  central: Candidate[];
  decoys: Candidate[]; // incidental / substantial / absent traps
}

const c = (title: string, overview: string, keywords: string[], genres: string[], truth: Truth): Candidate => ({
  title,
  overview,
  genres,
  keywords,
  truth,
});

/**
 * A generator of decoys that share a subject's vocabulary but are NOT central.
 * Built from the subject's own words so it generalizes to every subject.
 */
export function syntheticDecoys(canonical: string, label: string, lex: string[]): Candidate[] {
  const word = label.toLowerCase();
  const genresCrime = ['Crime', 'Thriller', 'Mystery'];
  // IMPORTANT: no decoy title contains the subject word. A title hit is a
  // legitimate strong central signal (a film literally named after the
  // subject usually IS about it), so hiding a trap behind a title match would
  // test an unrealistic case. The real Snake-Eyes class puts the subject only
  // in the OVERVIEW — as a setting, a former occupation, or a metaphor — which
  // is exactly what these decoys model.
  return [
    // Setting only — the Snake Eyes class: subject is where a scene happens.
    c(
      `The Setup`,
      `A detective is at a ${word} event when a senator is assassinated beside him, and he must unravel a sprawling political conspiracy before dawn.`,
      ['conspiracy', 'assassination', 'detective', canonical],
      genresCrime,
      'incidental',
    ),
    // Former occupation, single mention.
    c(
      `After the Fall`,
      `A former ${word} figure now running a diner gets pulled into a violent heist that spirals out of control.`,
      ['heist', 'crime'],
      ['Crime', 'Drama'],
      'incidental',
    ),
    // Metaphorical use — subject appears once, only as a figure of speech, and
    // NOT in the title (a title hit is a legitimate strong signal).
    c(
      `War of Words`,
      `Two rival poets treat every debate like a ${word}, trading verbal blows in a battle of wits across the city's cafés.`,
      ['poetry', 'rivalry'],
      ['Comedy', 'Romance'],
      'incidental',
    ),
    // Absent — unrelated film matched only by a loose related tag id.
    c(
      `Silent Harbor`,
      `A grieving widow restores a lighthouse on a remote coast and slowly rebuilds her life among the townsfolk.`,
      ['grief', 'small town'],
      ['Drama'],
      'absent',
    ),
  ];
}

/** A generator of genuinely-central candidates for any subject. */
export function syntheticCentral(canonical: string, label: string, lex: string[]): Candidate[] {
  const w = label.toLowerCase();
  const primary = lex[0] ?? canonical;
  const second = lex[1] ?? primary;
  return [
    c(
      `The ${label} Champion`,
      `A young ${primary} prodigy rises through the ranks of competitive ${w}, and the sustained story is their ${w} career, rivalries and title fight.`,
      [canonical, primary, second],
      ['Drama'],
      'central',
    ),
    c(
      `${label} Season`,
      `An ageing ${primary} returns for one last shot, and the film follows the ${w} training, the ${w} bouts, and the toll the ${w} life takes.`,
      [canonical, primary],
      ['Drama'],
      'central',
    ),
    c(
      `Heart of the ${label}`,
      `Two ${primary} rivals define a generation of ${w}; the entire narrative is their ${w} careers and their defining ${w} contest.`,
      [canonical, primary, second],
      ['Drama'],
      'central',
    ),
  ];
}

/**
 * The frozen curated subjects. Kept deliberately broad (sports, professions,
 * settings, events, concepts) so the audit proves generalization, not a
 * boxing patch. Synthetic central/decoy generators extend coverage to arbitrary
 * subjects at scale in the generator.
 */
export const CURATED: SubjectCorpus[] = [
  {
    canonical: 'boxing',
    label: 'Boxing',
    lexemes: ['boxing', 'boxer', 'prizefighter', 'prizefighting', 'heavyweight', 'ring', 'knockout', 'boxing match'],
    central: [
      c('Creed', 'The former World Heavyweight Champion Rocky Balboa serves as a trainer and mentor to Adonis Johnson, a rising boxer chasing the title.', ['boxing', 'boxer', 'sport'], ['Drama'], 'central'),
      c('The Fighter', 'The story of boxer Micky Ward and his brother Dicky, a former boxer turned trainer, on his road to a championship.', ['boxing', 'boxer'], ['Drama'], 'central'),
      c('Million Dollar Baby', 'A determined woman works with a hardened boxing trainer to become a professional boxer and fight for the title.', ['boxing', 'boxer'], ['Drama'], 'central'),
    ],
    decoys: [
      c('Snake Eyes', 'Corrupt cop Rick Santoro is at an Atlantic City boxing match when the Secretary of Defense is assassinated beside him, and he uncovers a conspiracy.', ['conspiracy', 'assassination', 'boxing', 'casino'], ['Crime', 'Thriller', 'Mystery'], 'incidental'),
      c('Pulp Fiction', 'The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in tales of violence and redemption.', ['hitman', 'boxer', 'crime'], ['Thriller', 'Crime'], 'incidental'),
      c('The Big Bang', 'A private investigator searches for a missing stripper and a fortune in diamonds in a violent neo-noir mystery.', ['private detective', 'noir'], ['Thriller', 'Mystery'], 'absent'),
    ],
  },
  {
    canonical: 'courtroom',
    label: 'Courtroom',
    lexemes: ['courtroom', 'trial', 'court', 'attorney', 'lawyer', 'jury', 'verdict', 'prosecutor', 'defense', 'testimony'],
    central: [
      c('A Few Good Men', 'A military lawyer defends two Marines in a court-martial, and the sustained drama is the courtroom trial and the testimony that cracks the case.', ['courtroom', 'trial', 'military'], ['Drama'], 'central'),
      c('A Time to Kill', 'A young attorney mounts a courtroom defense in a racially charged murder trial, and the jury deliberation drives the film.', ['courtroom', 'trial', 'lawyer'], ['Drama', 'Crime'], 'central'),
    ],
    decoys: [
      c('Liar Liar', 'A fast-talking lawyer physically cannot lie for 24 hours, wreaking comic havoc at home and briefly in one court scene.', ['comedy', 'lawyer'], ['Comedy'], 'incidental'),
      c('Kangaroo Jack', 'Two friends travel to the Australian outback to deliver mob money and end up chasing a wild kangaroo.', ['australia', 'kangaroo'], ['Comedy', 'Adventure'], 'absent'),
    ],
  },
  {
    canonical: 'chess',
    label: 'Chess',
    lexemes: ['chess', 'chessboard', 'grandmaster', 'checkmate'],
    central: [
      c("The Queen's Gambit", 'An orphaned chess prodigy rises through competitive chess to become a grandmaster, and the sustained story is her chess career and rivalries.', ['chess', 'prodigy'], ['Drama'], 'central'),
    ],
    decoys: [
      c('The Karate Kid', 'A bullied teenager learns karate from a wise handyman to defend himself and win a tournament.', ['karate', 'coming of age'], ['Drama', 'Family'], 'absent'),
      c('The Long Game', 'A ruthless senator treats the campaign like a game of chess, out-maneuvering rivals in a metaphorical battle for power.', ['politics', 'election'], ['Drama'], 'incidental'),
    ],
  },
  {
    canonical: 'submarine',
    label: 'Submarine',
    lexemes: ['submarine', 'sub', 'periscope', 'torpedo', 'depth charge', 'u boat'],
    central: [
      c('Das Boot', 'The claustrophobic voyage of a German U-boat crew; the entire film is life aboard the submarine under depth-charge attack.', ['submarine', 'u boat', 'war'], ['Drama', 'War'], 'central'),
    ],
    decoys: [
      c('Yellow Afternoon', 'A family road trip goes sideways; a toy submarine in a bathtub appears in a single childhood flashback.', ['family', 'road trip'], ['Comedy'], 'incidental'),
    ],
  },
  {
    canonical: 'journalism',
    label: 'Journalism',
    lexemes: ['journalist', 'journalism', 'reporter', 'reporting', 'newspaper', 'newsroom'],
    central: [
      c('Spotlight', "The Boston Globe's investigative reporters uncover a scandal; the sustained story is the journalism, the reporting and the newsroom.", ['journalist', 'investigation', 'newspaper'], ['Drama', 'History'], 'central'),
    ],
    decoys: [
      c('Twister', 'Storm chasers race to deploy a sensor into powerful tornadoes; one character is a former reporter mentioned once.', ['tornado', 'storm'], ['Action', 'Adventure'], 'incidental'),
    ],
  },
  {
    canonical: 'christmas',
    label: 'Christmas',
    lexemes: ['christmas', 'santa', 'yuletide', 'nativity', 'holiday season'],
    central: [
      c('The Santa Clause', 'After an accident on Christmas Eve a man must become Santa, and Christmas itself depends on him for the whole film.', ['christmas', 'santa'], ['Comedy', 'Family'], 'central'),
    ],
    decoys: [
      c('Die Hard', 'A New York cop takes on terrorists holding hostages in an LA skyscraper during a Christmas party.', ['christmas', 'terrorist', 'hostage'], ['Action', 'Thriller'], 'incidental'),
    ],
  },
];
