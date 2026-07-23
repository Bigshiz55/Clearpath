/**
 * Frozen gold expectations for the seed-similarity suite. Expectations are
 * behavioural and attribute-based — never "title X must be at rank N". They
 * encode the required properties: seed/duplicate exclusion, contradiction
 * rejection, genuine-match qualification, franchise capping, and fewer-results
 * honesty. Do NOT weaken these to make a patch pass (safeguard #4).
 */
import { DEV_FIXTURES, HOLDOUT_FIXTURES, type SeedFixture } from './fixtures';

export interface GoldCase {
  id: string;
  split: 'dev' | 'holdout';
  fixtureKey: string;
  /** Natural-language forms (EN/ES/ZH) that must normalize to this same case. */
  utterances: { lang: 'en' | 'es' | 'zh'; text: string }[];
  intent: 'similar_to' | 'where_to_watch' | 'exact_lookup';
  lens?: string;
  requestedCount: number;
  allowFranchise: boolean;
  allowSeed: boolean;
  expect: {
    /** Canonical ids that MUST be excluded (seed + canonical duplicates). */
    excludedCanonical: string[];
    /** Canonical ids that MUST fail the similarity gate (contradictions). */
    mustFail: string[];
    /** Canonical ids that MUST qualify (genuine matches). */
    mustQualify: string[];
    /** Max franchise-related results allowed in the top 5. */
    maxFranchiseTop5: number;
  };
}

const rocky = (over: Partial<GoldCase> & { id: string; utterances: GoldCase['utterances']; expect: GoldCase['expect'] }): GoldCase => ({
  split: 'dev', fixtureKey: 'rocky', intent: 'similar_to', requestedCount: 5, allowFranchise: false, allowSeed: false, ...over,
});

export const GOLD_CASES: GoldCase[] = [
  // ---- Default "movies like Rocky" (EN/ES/ZH equivalence) ----
  rocky({
    id: 'rocky.default',
    utterances: [
      { lang: 'en', text: 'I like movies like Rocky. Give me some things you think I would like.' },
      { lang: 'en', text: 'movies like Rocky' },
      { lang: 'es', text: 'Busca películas parecidas a Rocky.' },
      { lang: 'zh', text: '找一些像《洛奇》的电影。' },
    ],
    expect: {
      excludedCanonical: ['rocky-1976'],
      mustFail: ['edward-scissorhands-1990', 'the-shape-of-water-2017', 'la-la-land-2016'],
      mustQualify: ['creed-2015', 'the-fighter-2010', 'warrior-2011'],
      maxFranchiseTop5: 1,
    },
  }),
  // ---- Underdog lens: non-boxing underdog (Rudy) should qualify strongly ----
  rocky({
    id: 'rocky.underdog',
    lens: 'underdog',
    utterances: [
      { lang: 'en', text: 'more underdog movies like Rocky' },
      { lang: 'es', text: 'más películas de superación como Rocky' },
      { lang: 'zh', text: '更多像《洛奇》那样的逆袭电影' },
    ],
    expect: {
      excludedCanonical: ['rocky-1976'],
      mustFail: ['edward-scissorhands-1990', 'la-la-land-2016'],
      mustQualify: ['rudy-1993', 'creed-2015'],
      maxFranchiseTop5: 1,
    },
  }),
  // ---- "no sequels": franchise excluded ----
  rocky({
    id: 'rocky.no_sequels',
    utterances: [
      { lang: 'en', text: 'like Rocky, but no sequels' },
      { lang: 'es', text: 'como Rocky, pero no secuelas' },
      { lang: 'zh', text: '像《洛奇》，但不要续集' },
    ],
    allowFranchise: false,
    expect: {
      excludedCanonical: ['rocky-1976', 'rocky-ii', 'rocky-iv'],
      mustFail: ['edward-scissorhands-1990'],
      mustQualify: ['creed-2015', 'the-fighter-2010'],
      maxFranchiseTop5: 0,
    },
  }),
  // ---- "include the franchise": franchise allowed ----
  rocky({
    id: 'rocky.include_franchise',
    utterances: [
      { lang: 'en', text: 'include the Rocky franchise' },
      { lang: 'es', text: 'incluye la saga de Rocky' },
      { lang: 'zh', text: '把《洛奇》系列也算上' },
    ],
    allowFranchise: true,
    expect: {
      excludedCanonical: ['rocky-1976'], // the seed itself still excluded
      mustFail: ['edward-scissorhands-1990'],
      mustQualify: ['rocky-ii', 'creed-2015'],
      maxFranchiseTop5: 5, // franchise explicitly requested
    },
  }),
  // ---- Intent guard: "where can I watch Rocky?" — seed intentionally allowed ----
  rocky({
    id: 'rocky.where_to_watch',
    intent: 'where_to_watch',
    allowSeed: true,
    utterances: [
      { lang: 'en', text: 'where can I watch Rocky?' },
      { lang: 'es', text: '¿dónde puedo ver Rocky?' },
      { lang: 'zh', text: '在哪里可以看《洛奇》？' },
    ],
    expect: { excludedCanonical: [], mustFail: [], mustQualify: ['rocky-1976'], maxFranchiseTop5: 5 },
  }),

  // ---- HOLDOUT (different seeds; not used to design the gate) ----
  {
    id: 'jaws.default', split: 'holdout', fixtureKey: 'jaws', intent: 'similar_to',
    utterances: [{ lang: 'en', text: 'movies like Jaws' }, { lang: 'es', text: 'películas como Tiburón' }, { lang: 'zh', text: '像《大白鲨》的电影' }],
    requestedCount: 5, allowFranchise: false, allowSeed: false,
    expect: { excludedCanonical: ['jaws-1975'], mustFail: ['finding-nemo-2003'], mustQualify: ['the-shallows-2016'], maxFranchiseTop5: 1 },
  },
  {
    id: 'groundhog.default', split: 'holdout', fixtureKey: 'groundhog', intent: 'similar_to',
    utterances: [{ lang: 'en', text: 'movies like Groundhog Day' }, { lang: 'es', text: 'películas como El día de la marmota' }, { lang: 'zh', text: '像《土拨鼠之日》的电影' }],
    requestedCount: 5, allowFranchise: false, allowSeed: false,
    expect: { excludedCanonical: ['groundhog-day-1993'], mustFail: ['triangle-2009'], mustQualify: ['palm-springs-2020', 'about-time-2013'], maxFranchiseTop5: 1 },
  },
];

export function fixtureFor(key: string): SeedFixture {
  const f = [...DEV_FIXTURES, ...HOLDOUT_FIXTURES].find((x) => x.key === key);
  if (!f) throw new Error(`No fixture for ${key}`);
  return f;
}
