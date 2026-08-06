import { describe, it, expect } from 'vitest';
import {
  evaluateSubjectCentrality,
  type SubjectRequirement,
  type CandidateEvidence,
} from './semanticEligibility';

/**
 * The evaluator is subject-agnostic: every subject below is expressed ONLY as a
 * `lexemes` list handed to the same function. There is no per-topic branch in
 * the module and none here — the identical code decides boxing, courtroom,
 * chess, mountaineering, journalism, heist, serial-killer, medical, Christmas
 * and political-campaign. Metadata is representative of the real TMDB records.
 */

const strict = (canonical: string, label: string, lexemes: string[]): SubjectRequirement => ({
  canonical,
  label,
  lexemes,
  strict: true,
});

const ev = (p: Partial<CandidateEvidence> & { title: string }): CandidateEvidence => ({
  overview: '',
  genres: [],
  keywords: [],
  ...p,
});

// Curated boxing vocabulary (as finderSubject supplies it): the subject word,
// its forms, and a bounded set of context terms — never a title name.
const BOXING = strict('boxing', 'Boxing', [
  'boxing',
  'boxer',
  'prizefighter',
  'prizefighting',
  'heavyweight',
  'ring',
  'knockout',
  'boxing match',
]);

describe('semantic eligibility — representative boxing titles', () => {
  it('Creed — exact boxing tag corroborated by the summary → CENTRAL / PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Creed',
        overview:
          'The former World Heavyweight Champion Rocky Balboa serves as a trainer and mentor to Adonis Johnson, the son of his late friend and former rival Apollo Creed.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer', 'sport', 'philadelphia', 'rivalry'],
      }),
    );
    expect(v.centrality).toBe('CENTRAL');
    expect(v.status).toBe('PASS');
  });

  it('Creed II — sequel, exact tag + heavyweight in summary → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Creed II',
        overview:
          'Life has become a balancing act for Adonis Creed. Between personal obligations and training for his next big fight, he is up against the challenge of his life. Facing an opponent with ties to his family’s past only intensifies his impending battle in the ring.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer', 'sequel', 'rivalry'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('Creed III — title carries the franchise; exact tag + fight summary → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Creed III',
        overview:
          'After dominating the boxing world, Adonis Creed has been thriving in his career and family life. A childhood friend and former boxing prodigy resurfaces.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer'],
      }),
    );
    expect(v.centrality).toBe('CENTRAL');
    expect(v.status).toBe('PASS');
  });

  it('The Fighter — "boxer" in summary + exact tag → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'The Fighter',
        overview:
          'The story of boxer "Irish" Micky Ward and his brother Dicky, a former boxer turned trainer, on his unlikely road to a championship.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer', 'based on a true story'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('Bleed for This — boxing champion biopic → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Bleed for This',
        overview:
          'The inspirational story of World Champion boxer Vinny Pazienza who, after a near-fatal car crash, mounts a comeback in the ring.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer', 'comeback'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('Big George Foreman — heavyweight boxing biopic → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Big George Foreman',
        overview:
          'The story of two-time world heavyweight boxing champion George Foreman, from his humble beginnings to an Olympic gold medal.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer', 'biography'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('Hands of Stone — Roberto Durán boxing biopic → PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Hands of Stone',
        overview:
          'The legendary Roberto Durán and his trainer Ray Arcel change the sport of boxing over decades of prizefighting.',
        genres: ['Drama'],
        keywords: ['boxing', 'boxer'],
      }),
    );
    expect(v.status).toBe('PASS');
  });

  it('X-Men Origins: Wolverine — superhero film, boxing not central → FAIL', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'X-Men Origins: Wolverine',
        overview:
          'After seeking to live a normal life, Logan sets out to avenge the death of his girlfriend by undergoing the mutant Weapon X program and becoming Wolverine.',
        genres: ['Action', 'Science Fiction', 'Adventure'],
        // Present in the candidate pool via a related tag; not an exact boxing subject.
        keywords: ['superhero', 'mutant', 'based on comic', 'cage fight'],
      }),
    );
    expect(v.centrality).not.toBe('CENTRAL');
    expect(v.status).toBe('FAIL');
  });

  it('Nickel Boys — reform-school drama, boxing absent → FAIL', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Nickel Boys',
        overview:
          'Two Black boys endure the harrowing abuses of a reform school in 1960s Florida, in an adaptation of the Pulitzer-winning novel.',
        genres: ['Drama', 'History'],
        keywords: ['based on novel', 'racism', 'coming of age'],
      }),
    );
    expect(v.status).toBe('FAIL');
    expect(v.centrality).toBe('UNSUPPORTED');
  });

  it('Brawl in Cell Block 99 — boxer is backstory, story is prison → FAIL', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'Brawl in Cell Block 99',
        overview:
          'A former boxer-turned-drug runner lands in a brutal prison battleground after a deal gone wrong, and must fight his way through cell blocks.',
        genres: ['Action', 'Thriller', 'Crime'],
        // Tagged for prison violence, not the sport.
        keywords: ['prison', 'drug', 'brutal violence', 'brawl'],
      }),
    );
    // A single premise mention of "boxer" with no exact boxing tag is MATERIAL,
    // and a strict request rejects MATERIAL.
    expect(v.centrality).toBe('MATERIAL');
    expect(v.status).toBe('FAIL');
  });

  it('The Big Bang — noir mystery, boxing absent → FAIL', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({
        title: 'The Big Bang',
        overview:
          'A private investigator searches for a missing stripper and a fortune in diamonds, narrating a violent neo-noir mystery.',
        genres: ['Action', 'Thriller', 'Mystery'],
        keywords: ['private detective', 'noir', 'diamond'],
      }),
    );
    expect(v.status).toBe('FAIL');
  });

  it('incomplete evidence — exact tag but no summary text → UNKNOWN, not PASS', () => {
    const v = evaluateSubjectCentrality(
      BOXING,
      ev({ title: 'Untitled Project 47', overview: '', genres: [], keywords: ['boxing'] }),
    );
    expect(v.status).toBe('UNKNOWN');
    expect(v.status).not.toBe('PASS');
  });
});

/**
 * CROSS-DOMAIN — the same evaluator, driven only by each subject's own lexemes.
 * For every subject: an obvious pass, an obvious/misleading-keyword fail, and an
 * incomplete-evidence case.
 */
describe('semantic eligibility — cross-domain (no per-topic code)', () => {
  const cases: Array<{
    subject: SubjectRequirement;
    pass: CandidateEvidence;
    fail: CandidateEvidence;
    unknown: CandidateEvidence;
  }> = [
    {
      subject: strict('courtroom', 'Courtroom', ['courtroom', 'trial', 'court', 'attorney', 'lawyer', 'jury', 'verdict', 'prosecutor']),
      pass: ev({
        title: 'A Few Good Men',
        overview:
          'A military lawyer defends two Marines in a court-martial, uncovering the truth in a dramatic courtroom trial.',
        genres: ['Drama'],
        keywords: ['courtroom', 'trial', 'military'],
      }),
      fail: ev({
        title: 'Kangaroo Jack',
        overview:
          'Two friends travel to the Australian outback to deliver mob money and end up chasing a wild kangaroo.',
        genres: ['Comedy', 'Adventure'],
        keywords: ['australia', 'kangaroo', 'road trip'],
      }),
      unknown: ev({ title: 'Unknown Legal Film', overview: '', keywords: ['courtroom'] }),
    },
    {
      subject: strict('detective', 'Detective', ['detective', 'detectives', 'sleuth', 'investigator', 'homicide']),
      pass: ev({
        title: 'True Detective',
        overview:
          'Two detectives hunt a serial killer across seventeen years, as a homicide investigation reopens old wounds.',
        genres: ['Drama', 'Crime', 'Mystery'],
        keywords: ['detective', 'investigation', 'serial killer'],
      }),
      fail: ev({
        title: 'Cake Boss',
        overview: 'A family bakery competes to build the most elaborate wedding cakes in New Jersey.',
        genres: ['Reality'],
        keywords: ['baking', 'family business'],
      }),
      unknown: ev({ title: 'Untitled Case File', overview: '', keywords: ['detective'] }),
    },
    {
      subject: strict('christmas', 'Christmas', ['christmas', 'santa', 'yuletide', 'nativity', 'holiday season']),
      pass: ev({
        title: 'The Santa Clause',
        overview:
          'After an accident on Christmas Eve, a man is magically recruited to take over as Santa, and Christmas depends on him.',
        genres: ['Comedy', 'Family'],
        keywords: ['christmas', 'santa claus'],
      }),
      fail: ev({
        title: 'Die Hard',
        overview:
          'A New York cop takes on a group of terrorists holding hostages in a Los Angeles skyscraper during a party.',
        genres: ['Action', 'Thriller'],
        // Famously *set* at Christmas — tagged, but the story is a hostage siege.
        keywords: ['christmas', 'terrorist', 'hostage', 'skyscraper'],
      }),
      unknown: ev({ title: 'Untitled Holiday Film', overview: '', keywords: ['christmas'] }),
    },
    {
      subject: strict('medical', 'Medical', ['hospital', 'surgeon', 'medical', 'physician', 'nurse', 'emergency room']),
      pass: ev({
        title: 'The Good Doctor',
        overview:
          'A young surgeon with autism joins a prestigious hospital, navigating the demands of medical practice and the operating room.',
        genres: ['Drama'],
        keywords: ['hospital', 'surgeon', 'medical drama'],
      }),
      fail: ev({
        title: 'Doctor Strange',
        overview:
          'A neurosurgeon loses the use of his hands and discovers the hidden world of magic and alternate dimensions.',
        genres: ['Action', 'Fantasy', 'Science Fiction'],
        keywords: ['superhero', 'magic', 'based on comic'],
      }),
      unknown: ev({ title: 'Untitled Project 12', overview: '', keywords: ['hospital'] }),
    },
    {
      subject: strict('heist', 'Heist', ['heist', 'robbery', 'burglary', 'the score', 'safecracker', 'vault']),
      pass: ev({
        title: 'Ocean’s Eleven',
        overview:
          'Danny Ocean assembles a crew to pull off an elaborate heist, robbing three Las Vegas casinos in one night.',
        genres: ['Crime', 'Thriller'],
        keywords: ['heist', 'robbery', 'casino'],
      }),
      fail: ev({
        title: 'Finding Nemo',
        overview:
          'A timid clownfish searches the ocean to rescue his son, who has been captured and placed in a dentist’s aquarium.',
        genres: ['Animation', 'Family'],
        keywords: ['ocean', 'fish', 'father son'],
      }),
      unknown: ev({ title: 'Untitled Caper', overview: '', keywords: ['heist'] }),
    },
    {
      subject: strict('serial killer', 'Serial killer', ['serial killer', 'serial murderer', 'killer', 'murders']),
      pass: ev({
        title: 'Mindhunter',
        overview:
          'Two FBI agents interview imprisoned serial killers to understand how they think and to solve ongoing serial murders.',
        genres: ['Drama', 'Crime'],
        keywords: ['serial killer', 'fbi', 'profiling'],
      }),
      fail: ev({
        title: 'The Great British Bake Off',
        overview: 'Amateur bakers compete across themed weeks for the title of Britain’s best baker.',
        genres: ['Reality'],
        keywords: ['baking', 'competition'],
      }),
      unknown: ev({ title: 'Untitled Crime Series', overview: '', keywords: ['serial killer'] }),
    },
    {
      subject: strict('journalism', 'Journalism', ['journalist', 'journalism', 'reporter', 'reporting', 'newspaper', 'newsroom']),
      pass: ev({
        title: 'Spotlight',
        overview:
          'The Boston Globe’s investigative reporters uncover a massive scandal, in a story about the power of journalism and reporting.',
        genres: ['Drama', 'History'],
        keywords: ['journalist', 'investigation', 'newspaper'],
      }),
      fail: ev({
        title: 'Twister',
        overview: 'Storm chasers race to deploy a sensor into the heart of powerful tornadoes across Oklahoma.',
        genres: ['Action', 'Adventure'],
        keywords: ['tornado', 'storm', 'weather'],
      }),
      unknown: ev({ title: 'Untitled Press Film', overview: '', keywords: ['journalist'] }),
    },
    {
      subject: strict('chess', 'Chess', ['chess', 'chessboard', 'grandmaster', 'checkmate']),
      pass: ev({
        title: 'The Queen’s Gambit',
        overview:
          'An orphaned chess prodigy rises through the ranks of competitive chess to become a grandmaster while battling addiction.',
        genres: ['Drama'],
        keywords: ['chess', 'prodigy', 'cold war'],
      }),
      fail: ev({
        title: 'The Karate Kid',
        overview: 'A bullied teenager learns karate from a wise handyman to defend himself and win a tournament.',
        genres: ['Drama', 'Family'],
        keywords: ['karate', 'coming of age', 'mentor'],
      }),
      unknown: ev({ title: 'Untitled Board-Game Film', overview: '', keywords: ['chess'] }),
    },
    {
      subject: strict('mountaineering', 'Mountaineering', ['mountaineering', 'mountaineer', 'climb', 'climber', 'summit', 'everest', 'alpine']),
      pass: ev({
        title: 'Everest',
        overview:
          'Two expeditions attempt to summit Mount Everest and are caught in a ferocious storm during the climb down.',
        genres: ['Drama', 'Adventure'],
        keywords: ['mountaineering', 'everest', 'survival'],
      }),
      fail: ev({
        title: 'The Devil Wears Prada',
        overview: 'A young assistant navigates the cutthroat world of high fashion under a demanding magazine editor.',
        genres: ['Comedy', 'Drama'],
        keywords: ['fashion', 'magazine', 'career'],
      }),
      unknown: ev({ title: 'Untitled Project 88', overview: '', keywords: ['climb'] }),
    },
    {
      subject: strict('political campaign', 'Political campaign', ['campaign', 'election', 'candidate', 'primary', 'presidential race']),
      pass: ev({
        title: 'The Ides of March',
        overview:
          'A press secretary on a presidential campaign learns hard truths about politics during a heated primary election.',
        genres: ['Drama'],
        keywords: ['election', 'campaign', 'politics'],
      }),
      fail: ev({
        title: 'Jurassic Park',
        overview: 'A theme park of cloned dinosaurs descends into chaos when the power fails and the animals escape.',
        genres: ['Adventure', 'Science Fiction'],
        keywords: ['dinosaur', 'theme park', 'cloning'],
      }),
      unknown: ev({ title: 'Untitled Project 20', overview: '', keywords: ['election'] }),
    },
  ];

  for (const c of cases) {
    describe(c.subject.label, () => {
      it('obvious match → PASS (CENTRAL)', () => {
        const v = evaluateSubjectCentrality(c.subject, c.pass);
        expect(v.centrality).toBe('CENTRAL');
        expect(v.status).toBe('PASS');
      });
      it('unrelated / misleading-keyword → FAIL (never PASS)', () => {
        const v = evaluateSubjectCentrality(c.subject, c.fail);
        expect(v.status).toBe('FAIL');
        expect(v.centrality).not.toBe('CENTRAL');
      });
      it('incomplete evidence (tag, no text) → UNKNOWN, never PASS', () => {
        const v = evaluateSubjectCentrality(c.subject, c.unknown);
        expect(v.status).toBe('UNKNOWN');
        expect(v.status).not.toBe('PASS');
      });
    });
  }
});

describe('semantic eligibility — invariants', () => {
  it('never treats UNKNOWN as PASS', () => {
    const v = evaluateSubjectCentrality(BOXING, ev({ title: 'X', overview: '', keywords: ['boxing'] }));
    expect(v.status === 'PASS' && v.centrality !== 'CENTRAL').toBe(false);
    expect(v.status).toBe('UNKNOWN');
  });

  it('rejectionReason is present exactly when status is not PASS', () => {
    const pass = evaluateSubjectCentrality(
      BOXING,
      ev({ title: 'Creed III', overview: 'A boxing champion returns to the ring.', keywords: ['boxing'] }),
    );
    expect(pass.status).toBe('PASS');
    expect(pass.rejectionReason).toBeNull();

    const fail = evaluateSubjectCentrality(
      BOXING,
      ev({ title: 'Random', overview: 'A chef opens a restaurant.', genres: ['Comedy'], keywords: ['cooking'] }),
    );
    expect(fail.status).not.toBe('PASS');
    expect(fail.rejectionReason).not.toBeNull();
  });

  it('non-strict request accepts MATERIAL where strict rejects it', () => {
    const material = ev({
      title: 'Brawl in Cell Block 99',
      overview: 'A former boxer-turned-drug runner lands in a brutal prison battleground.',
      genres: ['Action', 'Crime'],
      keywords: ['prison', 'drug'],
    });
    const strictV = evaluateSubjectCentrality(BOXING, material);
    const relaxed = evaluateSubjectCentrality({ ...BOXING, strict: false }, material);
    expect(strictV.status).toBe('FAIL');
    expect(relaxed.status).toBe('PASS');
    expect(relaxed.centrality).toBe('MATERIAL');
  });

  it('is deterministic — identical inputs give identical verdicts', () => {
    const input = ev({
      title: 'Creed',
      overview: 'The former World Heavyweight Champion trains a young boxer.',
      keywords: ['boxing'],
    });
    const a = evaluateSubjectCentrality(BOXING, input);
    const b = evaluateSubjectCentrality(BOXING, input);
    expect(a).toEqual(b);
  });
});
