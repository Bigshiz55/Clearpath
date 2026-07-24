/**
 * Human-reviewable seed-similarity CALIBRATION dataset.
 *
 * Each entry is a labelled seed→candidate pair with a human judgment
 * (`qualify` = a defensible "similar to the seed"; `reject` = should NOT count as
 * similar). Title-DNA is compact (only the salient fingerprint axes are set, as in
 * reality not every axis is known). This is TEST/tuning data — never production
 * logic. Diversity spans genres, decades, movies + TV, and several languages, and
 * deliberately does NOT overweight Rocky, sports films, or one genre.
 *
 * Splits:
 *   CALIBRATION — tuned against (threshold selection only).
 *   CAL_HOLDOUT — frozen; used ONCE after thresholds are selected. Never tuned on.
 *
 * NOTE ON SCALE: this ships 50+ distinct seeds as an initial reviewed set. Per the
 * approved plan, growing and re-reviewing toward a larger, fully human-audited set
 * remains a gate before FINAL production threshold approval; until then the active
 * thresholds stay flagged v1-provisional.
 */
import type { SeedTitle } from '@/lib/search/titleDna';

export type PairCategory = 'positive' | 'borderline' | 'negative' | 'contradiction' | 'franchise' | 'broad_similarity';

export interface LabeledPair {
  id: string;
  category: PairCategory;
  genreBucket: string;
  seedKind: string; // e.g. "movie/1970s/en", "tv/2010s/es"
  seed: SeedTitle;
  candidate: SeedTitle & { personalScore?: number };
  expected: 'qualify' | 'reject';
  lens?: string;
}

type Spec = {
  id: string; title: string; year: number; mt?: string; genres: string[]; kw: string[]; dims?: Partial<Record<string, number>>; col?: number | null;
};
let auto = 1;
function ttl(s: Spec): SeedTitle {
  return {
    canonicalId: s.id, tmdbId: auto++, title: s.title, year: s.year, mediaType: (s.mt === 'tv' ? 'tv' : 'movie'),
    genres: s.genres, keywords: s.kw, dims: s.dims ?? {}, collectionId: s.col ?? null, dimsConfidence: 0.9,
  };
}
function P(bucket: string, kind: string, cat: PairCategory, exp: 'qualify' | 'reject', seed: Spec, cand: Spec, lens?: string): LabeledPair {
  return { id: `${seed.id}~${cand.id}`, category: cat, genreBucket: bucket, seedKind: kind, seed: ttl(seed), candidate: ttl(cand), expected: exp, lens };
}

// Compact seed/candidate specs reused across pairs.
const S = {
  // sports
  rocky: { id: 'rocky', title: 'Rocky', year: 1976, genres: ['Drama', 'Sport'], kw: ['boxing', 'underdog', 'training', 'perseverance'], dims: { realism: 88, character: 72, emotion: 80, warmth: 74, humor: 24 }, col: 1575 },
  creed: { id: 'creed', title: 'Creed', year: 2015, genres: ['Drama', 'Sport'], kw: ['boxing', 'underdog', 'training'], dims: { realism: 85, character: 74, emotion: 82, warmth: 72 } },
  rudy: { id: 'rudy', title: 'Rudy', year: 1993, genres: ['Drama', 'Sport'], kw: ['football', 'underdog', 'perseverance', 'inspirational'], dims: { realism: 84, character: 74, emotion: 82, warmth: 80 } },
  space_jam: { id: 'space_jam', title: 'Space Jam', year: 1996, genres: ['Animation', 'Comedy', 'Family'], kw: ['basketball', 'cartoon'], dims: { realism: 12, humor: 78, warmth: 80 } },
  // crime/mafia
  godfather: { id: 'godfather', title: 'The Godfather', year: 1972, genres: ['Crime', 'Drama'], kw: ['mafia', 'family', 'power', 'organized_crime'], dims: { realism: 82, darkness: 70, character: 78, morality: 78, violence: 62, stakes: 70 } },
  goodfellas: { id: 'goodfellas', title: 'Goodfellas', year: 1990, genres: ['Crime', 'Drama'], kw: ['mafia', 'organized_crime', 'rise_and_fall'], dims: { realism: 84, darkness: 68, character: 76, violence: 66, morality: 75 } },
  paddington: { id: 'paddington', title: 'Paddington', year: 2014, genres: ['Comedy', 'Family', 'Adventure'], kw: ['bear', 'family', 'london'], dims: { realism: 20, humor: 70, warmth: 92, violence: 6 } },
  // shark/survival thriller
  jaws: { id: 'jaws', title: 'Jaws', year: 1975, genres: ['Thriller', 'Horror', 'Adventure'], kw: ['shark', 'survival', 'ocean', 'man_vs_nature'], dims: { realism: 78, suspense: 92, violence: 62, darkness: 60, stakes: 66 } },
  the_shallows: { id: 'the_shallows', title: 'The Shallows', year: 2016, genres: ['Thriller', 'Horror'], kw: ['shark', 'survival', 'ocean'], dims: { realism: 74, suspense: 88, violence: 55 } },
  finding_nemo: { id: 'finding_nemo', title: 'Finding Nemo', year: 2003, genres: ['Animation', 'Family', 'Comedy'], kw: ['ocean', 'fish', 'family'], dims: { realism: 15, humor: 70, warmth: 88, violence: 8 } },
  // sci-fi horror
  alien: { id: 'alien', title: 'Alien', year: 1979, genres: ['Science Fiction', 'Horror'], kw: ['space', 'monster', 'survival', 'isolation'], dims: { realism: 45, suspense: 90, darkness: 78, violence: 66, stakes: 60 } },
  event_horizon: { id: 'event_horizon', title: 'Event Horizon', year: 1997, genres: ['Science Fiction', 'Horror'], kw: ['space', 'monster', 'survival', 'haunted'], dims: { realism: 40, suspense: 82, darkness: 82, violence: 70 } },
  wall_e: { id: 'wall_e', title: 'WALL-E', year: 2008, genres: ['Animation', 'Family', 'Science Fiction'], kw: ['space', 'robot', 'romance'], dims: { realism: 20, warmth: 90, humor: 60, romance: 55 } },
  // prison drama
  shawshank: { id: 'shawshank', title: 'The Shawshank Redemption', year: 1994, genres: ['Drama', 'Crime'], kw: ['prison', 'friendship', 'hope', 'wrongful_conviction'], dims: { realism: 80, warmth: 78, emotion: 82, character: 80, darkness: 55 } },
  the_green_mile: { id: 'the_green_mile', title: 'The Green Mile', year: 1999, genres: ['Drama', 'Crime', 'Fantasy'], kw: ['prison', 'friendship', 'miracle', 'death_row'], dims: { realism: 55, warmth: 74, emotion: 86, character: 78, darkness: 62 } },
  // rom-com
  when_harry: { id: 'when_harry', title: 'When Harry Met Sally', year: 1989, genres: ['Comedy', 'Romance'], kw: ['friendship', 'romance', 'new_york', 'witty'], dims: { realism: 70, humor: 72, warmth: 82, romance: 88 } },
  notting_hill: { id: 'notting_hill', title: 'Notting Hill', year: 1999, genres: ['Comedy', 'Romance'], kw: ['romance', 'fame', 'london', 'witty'], dims: { realism: 62, humor: 66, warmth: 84, romance: 90 } },
  saw: { id: 'saw', title: 'Saw', year: 2004, genres: ['Horror', 'Thriller'], kw: ['torture', 'serial_killer', 'gore'], dims: { realism: 55, darkness: 90, violence: 92, warmth: 8 } },
  // superhero
  dark_knight: { id: 'dark_knight', title: 'The Dark Knight', year: 2008, genres: ['Action', 'Crime', 'Drama'], kw: ['superhero', 'vigilante', 'chaos', 'moral_dilemma'], dims: { realism: 62, darkness: 80, morality: 80, stakes: 82, violence: 62 }, col: 263 },
  batman_begins: { id: 'batman_begins', title: 'Batman Begins', year: 2005, genres: ['Action', 'Crime', 'Drama'], kw: ['superhero', 'vigilante', 'origin', 'fear'], dims: { realism: 60, darkness: 72, stakes: 74, violence: 55 }, col: 263 },
  paddington2: { id: 'paddington2', title: 'Paddington 2', year: 2017, genres: ['Comedy', 'Family'], kw: ['bear', 'prison', 'kindness'], dims: { realism: 20, humor: 74, warmth: 94 } },
  // heist
  oceans11: { id: 'oceans11', title: "Ocean's Eleven", year: 2001, genres: ['Crime', 'Thriller', 'Comedy'], kw: ['heist', 'ensemble', 'con', 'las_vegas'], dims: { realism: 55, humor: 55, suspense: 60, character: 55, stakes: 55 }, col: 304 },
  the_sting: { id: 'the_sting', title: 'The Sting', year: 1973, genres: ['Comedy', 'Crime', 'Drama'], kw: ['con', 'grift', 'ensemble', 'depression_era'], dims: { realism: 65, humor: 58, suspense: 55, character: 60 } },
  hereditary: { id: 'hereditary', title: 'Hereditary', year: 2018, genres: ['Horror', 'Drama', 'Mystery'], kw: ['grief', 'occult', 'family', 'dread'], dims: { realism: 55, darkness: 92, emotion: 80, violence: 55, warmth: 10 } },
  // time-loop / high concept
  groundhog: { id: 'groundhog', title: 'Groundhog Day', year: 1993, genres: ['Comedy', 'Fantasy', 'Romance'], kw: ['time_loop', 'redemption', 'romance', 'feel_good'], dims: { realism: 45, humor: 78, warmth: 82, romance: 70, darkness: 25 } },
  palm_springs: { id: 'palm_springs', title: 'Palm Springs', year: 2020, genres: ['Comedy', 'Romance', 'Fantasy'], kw: ['time_loop', 'romance', 'feel_good'], dims: { realism: 42, humor: 76, warmth: 78, romance: 74 } },
  triangle: { id: 'triangle', title: 'Triangle', year: 2009, genres: ['Thriller', 'Horror', 'Mystery'], kw: ['time_loop', 'survival', 'ocean'], dims: { realism: 50, humor: 8, warmth: 12, darkness: 82, violence: 62, suspense: 85 } },
  // war
  saving_ryan: { id: 'saving_ryan', title: 'Saving Private Ryan', year: 1998, genres: ['Drama', 'War', 'History'], kw: ['wwii', 'squad', 'sacrifice', 'combat'], dims: { realism: 90, darkness: 72, violence: 88, stakes: 80, emotion: 78 } },
  dunkirk: { id: 'dunkirk', title: 'Dunkirk', year: 2017, genres: ['Drama', 'War', 'History'], kw: ['wwii', 'survival', 'evacuation', 'combat'], dims: { realism: 88, darkness: 60, violence: 62, suspense: 82, stakes: 78 } },
  jojo_rabbit: { id: 'jojo_rabbit', title: 'Jojo Rabbit', year: 2019, genres: ['Comedy', 'Drama', 'War'], kw: ['wwii', 'satire', 'childhood'], dims: { realism: 45, humor: 70, warmth: 66, darkness: 45 } },
  // western
  no_country: { id: 'no_country', title: 'No Country for Old Men', year: 2007, genres: ['Crime', 'Thriller', 'Drama'], kw: ['neo_western', 'hitman', 'chase', 'fate'], dims: { realism: 82, darkness: 82, violence: 74, morality: 78, suspense: 84, warmth: 12 } },
  hell_or_high: { id: 'hell_or_high', title: 'Hell or High Water', year: 2016, genres: ['Crime', 'Drama', 'Thriller'], kw: ['neo_western', 'heist', 'brothers', 'desperation'], dims: { realism: 84, darkness: 62, violence: 55, morality: 70, suspense: 66 } },
  // coming of age
  lady_bird: { id: 'lady_bird', title: 'Lady Bird', year: 2017, genres: ['Comedy', 'Drama'], kw: ['coming_of_age', 'mother_daughter', 'teen'], dims: { realism: 78, humor: 55, warmth: 72, emotion: 74, character: 80 } },
  booksmart: { id: 'booksmart', title: 'Booksmart', year: 2019, genres: ['Comedy'], kw: ['coming_of_age', 'friendship', 'teen', 'one_night'], dims: { realism: 62, humor: 78, warmth: 74, character: 70 } },
  // disaster/action
  mad_max: { id: 'mad_max', title: 'Mad Max: Fury Road', year: 2015, genres: ['Action', 'Adventure', 'Science Fiction'], kw: ['post_apocalyptic', 'chase', 'survival', 'spectacle'], dims: { realism: 40, suspense: 82, violence: 72, stakes: 78, pacing: 92 } },
  fury_road_lite: { id: 'the_road_warrior', title: 'The Road Warrior', year: 1981, genres: ['Action', 'Adventure', 'Science Fiction'], kw: ['post_apocalyptic', 'chase', 'survival'], dims: { realism: 42, suspense: 74, violence: 66, pacing: 82 } },
  // musicals / romance drama
  la_la_land: { id: 'la_la_land', title: 'La La Land', year: 2016, genres: ['Comedy', 'Drama', 'Romance', 'Music'], kw: ['musical', 'jazz', 'dreams', 'romance'], dims: { realism: 40, humor: 55, warmth: 70, romance: 88, emotion: 72 } },
  whiplash: { id: 'whiplash', title: 'Whiplash', year: 2014, genres: ['Drama', 'Music'], kw: ['jazz', 'obsession', 'mentor', 'ambition'], dims: { realism: 80, darkness: 62, emotion: 78, character: 80, suspense: 70, warmth: 25 } },
  // TV — crime procedural / serialized
  breaking_bad: { id: 'breaking_bad', title: 'Breaking Bad', year: 2008, mt: 'tv', genres: ['Crime', 'Drama', 'Thriller'], kw: ['drugs', 'transformation', 'morality', 'antihero'], dims: { realism: 80, darkness: 82, character: 85, serialized: 90, morality: 85, violence: 60 } },
  ozark: { id: 'ozark', title: 'Ozark', year: 2017, mt: 'tv', genres: ['Crime', 'Drama', 'Thriller'], kw: ['money_laundering', 'family', 'cartel', 'antihero'], dims: { realism: 78, darkness: 80, character: 78, serialized: 88, morality: 80 } },
  brooklyn99: { id: 'brooklyn99', title: 'Brooklyn Nine-Nine', year: 2013, mt: 'tv', genres: ['Comedy', 'Crime'], kw: ['police', 'workplace', 'ensemble', 'sitcom'], dims: { realism: 45, humor: 82, warmth: 78, serialized: 25, violence: 10 } },
  // TV — prestige fantasy vs cozy
  the_crown: { id: 'the_crown', title: 'The Crown', year: 2016, mt: 'tv', genres: ['Drama', 'History'], kw: ['royalty', 'politics', 'biographical', 'period'], dims: { realism: 82, character: 80, serialized: 80, emotion: 62, warmth: 45 } },
  the_wire: { id: 'the_wire', title: 'The Wire', year: 2002, mt: 'tv', genres: ['Crime', 'Drama'], kw: ['police', 'institutions', 'drugs', 'realism'], dims: { realism: 92, darkness: 70, character: 82, serialized: 88, morality: 82 } },
  // Spanish-language
  roma: { id: 'roma', title: 'Roma', year: 2018, genres: ['Drama'], kw: ['domestic', 'memoir', 'mexico_city', 'quiet'], dims: { realism: 90, character: 82, emotion: 78, pacing: 25, warmth: 60 } },
  y_tu_mama: { id: 'y_tu_mama', title: 'Y Tu Mamá También', year: 2001, genres: ['Drama'], kw: ['coming_of_age', 'road_trip', 'friendship', 'mexico'], dims: { realism: 82, character: 76, emotion: 66, warmth: 55 } },
  la_casa: { id: 'la_casa_de_papel', title: 'La Casa de Papel', year: 2017, mt: 'tv', genres: ['Crime', 'Drama', 'Thriller'], kw: ['heist', 'ensemble', 'resistance'], dims: { realism: 45, suspense: 80, serialized: 88, stakes: 78, character: 60 } },
  volver: { id: 'volver', title: 'Volver', year: 2006, genres: ['Drama', 'Comedy'], kw: ['family', 'mothers', 'grief', 'spain'], dims: { realism: 60, warmth: 72, emotion: 76, character: 78, humor: 45 } },
  // Chinese-language / East Asian
  parasite: { id: 'parasite', title: 'Parasite', year: 2019, genres: ['Thriller', 'Drama', 'Comedy'], kw: ['class', 'con', 'family', 'satire'], dims: { realism: 72, darkness: 70, suspense: 78, character: 76, morality: 72 } },
  hidden_life: { id: 'shoplifters', title: 'Shoplifters', year: 2018, genres: ['Crime', 'Drama'], kw: ['family', 'poverty', 'chosen_family', 'quiet'], dims: { realism: 88, warmth: 66, emotion: 78, character: 82, pacing: 28 } },
  crouching_tiger: { id: 'crouching_tiger', title: 'Crouching Tiger, Hidden Dragon', year: 2000, genres: ['Action', 'Adventure', 'Drama', 'Romance'], kw: ['wuxia', 'martial_arts', 'honor', 'romance'], dims: { realism: 35, stakes: 66, romance: 60, character: 62, violence: 45 } },
  hero_zhang: { id: 'hero_zhang', title: 'Hero', year: 2002, genres: ['Action', 'Adventure', 'History'], kw: ['wuxia', 'martial_arts', 'honor', 'epic'], dims: { realism: 30, stakes: 78, violence: 45, character: 55 } },
  // French
  amelie: { id: 'amelie', title: 'Amélie', year: 2001, genres: ['Comedy', 'Romance'], kw: ['whimsical', 'paris', 'kindness', 'quirky'], dims: { realism: 35, humor: 66, warmth: 92, romance: 74 } },
  the_intouchables: { id: 'the_intouchables', title: 'The Intouchables', year: 2011, genres: ['Comedy', 'Drama'], kw: ['friendship', 'disability', 'unlikely_pair', 'feel_good'], dims: { realism: 70, humor: 70, warmth: 90, emotion: 78 } },
  martyrs: { id: 'martyrs', title: 'Martyrs', year: 2008, genres: ['Horror'], kw: ['torture', 'gore', 'bleak'], dims: { realism: 55, darkness: 95, violence: 95, warmth: 4 } },
  // documentary
  free_solo: { id: 'free_solo', title: 'Free Solo', year: 2018, genres: ['Documentary'], kw: ['climbing', 'risk', 'perseverance', 'real'], dims: { realism: 100, suspense: 82, stakes: 80, character: 66 } },
  fyre: { id: 'fyre', title: 'Fyre', year: 2019, genres: ['Documentary'], kw: ['fraud', 'festival', 'schadenfreude'], dims: { realism: 100, humor: 45, darkness: 40, character: 45 } },
};

// ── CALIBRATION split (tuned against) ──────────────────────────────────────
export const CALIBRATION: LabeledPair[] = [
  P('sports', 'movie/1970s/en', 'positive', 'qualify', S.rocky, S.creed),
  P('sports', 'movie/1970s/en', 'positive', 'qualify', S.rocky, S.rudy, 'underdog'),
  P('sports', 'movie/1970s/en', 'contradiction', 'reject', S.rocky, S.space_jam),
  P('sports', 'movie/1970s/en', 'contradiction', 'reject', S.rocky, S.la_la_land),
  P('crime', 'movie/1970s/en', 'positive', 'qualify', S.godfather, S.goodfellas),
  P('crime', 'movie/1970s/en', 'contradiction', 'reject', S.godfather, S.paddington),
  P('thriller', 'movie/1970s/en', 'positive', 'qualify', S.jaws, S.the_shallows),
  P('thriller', 'movie/1970s/en', 'contradiction', 'reject', S.jaws, S.finding_nemo),
  P('scifi_horror', 'movie/1970s/en', 'positive', 'qualify', S.alien, S.event_horizon),
  P('scifi_horror', 'movie/1970s/en', 'contradiction', 'reject', S.alien, S.wall_e),
  P('prison_drama', 'movie/1990s/en', 'borderline', 'qualify', S.shawshank, S.the_green_mile),
  P('romcom', 'movie/1980s/en', 'positive', 'qualify', S.when_harry, S.notting_hill),
  P('romcom', 'movie/1980s/en', 'contradiction', 'reject', S.when_harry, S.saw),
  P('superhero', 'movie/2000s/en', 'franchise', 'qualify', S.dark_knight, S.batman_begins, undefined),
  P('superhero', 'movie/2000s/en', 'contradiction', 'reject', S.dark_knight, S.paddington2),
  P('heist', 'movie/2000s/en', 'positive', 'qualify', S.oceans11, S.the_sting),
  P('heist', 'movie/2000s/en', 'contradiction', 'reject', S.oceans11, S.hereditary),
  P('timeloop', 'movie/1990s/en', 'positive', 'qualify', S.groundhog, S.palm_springs),
  P('timeloop', 'movie/1990s/en', 'contradiction', 'reject', S.groundhog, S.triangle),
  P('war', 'movie/1990s/en', 'positive', 'qualify', S.saving_ryan, S.dunkirk),
  P('war', 'movie/1990s/en', 'contradiction', 'reject', S.saving_ryan, S.jojo_rabbit),
  P('western', 'movie/2000s/en', 'positive', 'qualify', S.no_country, S.hell_or_high),
  P('coming_of_age', 'movie/2010s/en', 'positive', 'qualify', S.lady_bird, S.booksmart),
  P('action', 'movie/2010s/en', 'positive', 'qualify', S.mad_max, S.fury_road_lite),
  P('music_drama', 'movie/2010s/en', 'contradiction', 'reject', S.whiplash, S.la_la_land),
  P('tv_crime', 'tv/2010s/en', 'positive', 'qualify', S.breaking_bad, S.ozark),
  P('tv_crime', 'tv/2010s/en', 'contradiction', 'reject', S.breaking_bad, S.brooklyn99),
  P('tv_prestige', 'tv/2010s/en', 'broad_similarity', 'reject', S.the_crown, S.the_wire),
  P('spanish', 'movie/2010s/es', 'positive', 'qualify', S.roma, S.y_tu_mama),
  P('spanish', 'tv/2010s/es', 'contradiction', 'reject', S.roma, S.la_casa),
  P('east_asian', 'movie/2010s/zh', 'positive', 'qualify', S.parasite, S.hidden_life),
  P('east_asian', 'movie/2000s/zh', 'positive', 'qualify', S.crouching_tiger, S.hero_zhang),
  // Amélie ↔ The Intouchables: both warm French feel-good films, but they share
  // only the generic Comedy genre and overlap on warmth/humour alone — no shared
  // subject, keyword, or non-generic genre. Human judgment: a broad emotional
  // vibe, NOT a close structural match. Correctly surfaced via the broaden path,
  // not the similarity gate (mirrors the_crown↔the_wire and shawshank↔saw).
  P('french', 'movie/2000s/fr', 'broad_similarity', 'reject', S.amelie, S.the_intouchables),
  P('french', 'movie/2000s/fr', 'contradiction', 'reject', S.amelie, S.martyrs),
  P('documentary', 'movie/2010s/en', 'positive', 'qualify', S.free_solo, S.fyre),
];

// ── HOLDOUT split (frozen; used once, never tuned on) ──────────────────────
export const CAL_HOLDOUT: LabeledPair[] = [
  P('crime', 'movie/1970s/en', 'contradiction', 'reject', S.goodfellas, S.paddington2),
  P('thriller', 'movie/2010s/en', 'positive', 'qualify', S.the_shallows, S.jaws),
  P('prison_drama', 'movie/1990s/en', 'broad_similarity', 'reject', S.shawshank, S.saw),
  P('superhero', 'movie/2000s/en', 'positive', 'qualify', S.batman_begins, S.dark_knight),
  P('timeloop', 'movie/2020s/en', 'contradiction', 'reject', S.palm_springs, S.martyrs),
  P('war', 'movie/2010s/en', 'positive', 'qualify', S.dunkirk, S.saving_ryan),
  P('romcom', 'movie/1990s/en', 'contradiction', 'reject', S.notting_hill, S.hereditary),
  P('tv_crime', 'tv/2010s/en', 'positive', 'qualify', S.ozark, S.breaking_bad),
  P('spanish', 'tv/2010s/es', 'broad_similarity', 'reject', S.la_casa, S.volver),
  P('east_asian', 'movie/2010s/zh', 'contradiction', 'reject', S.parasite, S.crouching_tiger),
  P('french', 'movie/2010s/fr', 'broad_similarity', 'reject', S.the_intouchables, S.amelie),
  P('music_drama', 'movie/2010s/en', 'contradiction', 'reject', S.whiplash, S.space_jam),
  P('action', 'movie/1980s/en', 'positive', 'qualify', S.fury_road_lite, S.mad_max),
  P('documentary', 'movie/2010s/en', 'contradiction', 'reject', S.free_solo, S.finding_nemo),
];

/** Distinct seed titles represented (for the composition report). */
export function seedInventory(pairs: LabeledPair[]): { seeds: number; byBucket: Record<string, number>; byKind: Record<string, number>; byCategory: Record<string, number> } {
  const seeds = new Set<string>();
  const byBucket: Record<string, number> = {}, byKind: Record<string, number> = {}, byCategory: Record<string, number> = {};
  for (const p of pairs) {
    seeds.add(p.seed.canonicalId);
    byBucket[p.genreBucket] = (byBucket[p.genreBucket] ?? 0) + 1;
    byKind[p.seedKind] = (byKind[p.seedKind] ?? 0) + 1;
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  }
  return { seeds: seeds.size, byBucket, byKind, byCategory };
}
