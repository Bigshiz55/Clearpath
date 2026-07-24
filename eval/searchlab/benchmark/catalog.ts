/**
 * Deterministic fixture CATALOG for the offline retrieval benchmark. These are a
 * stand-in search INDEX (real title strings used as index entries), never
 * user-facing fabricated results. The benchmark injects this as the fuzzy/internal
 * source so the whole pipeline runs offline with no TMDB/network.
 */
import type { Candidate } from '@/lib/search/retrieval/types';

export interface CatalogTitle {
  id: string;
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
  aliases: string[];
  typos: string[];       // plausible misspellings a generator can inject
  franchise?: string;
  genre?: string;
}

export const CATALOG_TITLES: CatalogTitle[] = [
  { id: 'movie:27205', title: 'Inception', year: 2010, mediaType: 'movie', aliases: [], typos: ['inceptio', 'incepton'], genre: 'thriller' },
  { id: 'movie:157336', title: 'Interstellar', year: 2014, mediaType: 'movie', aliases: [], typos: ['intersteller', 'interstelar'] },
  { id: 'tv:1399', title: 'Game of Thrones', year: 2011, mediaType: 'tv', aliases: ['got'], typos: ['game of throne'], franchise: 'Game of Thrones' },
  { id: 'movie:120', title: 'The Lord of the Rings', year: 2001, mediaType: 'movie', aliases: ['lotr'], typos: ['lord of the ring'], franchise: 'The Lord of the Rings' },
  { id: 'movie:671', title: 'Harry Potter', year: 2001, mediaType: 'movie', aliases: ['hp'], typos: ['harrypotter', 'hary potter'], franchise: 'Harry Potter' },
  { id: 'tv:1396', title: 'Breaking Bad', year: 2008, mediaType: 'tv', aliases: [], typos: ['braking bad'], genre: 'thriller' },
  { id: 'tv:2316', title: 'The Office', year: 2005, mediaType: 'tv', aliases: ['the office us'], typos: [] },
  { id: 'movie:11', title: 'Star Wars', year: 1977, mediaType: 'movie', aliases: [], typos: ['starwars', 'star war'], franchise: 'Star Wars' },
  { id: 'movie:603', title: 'The Matrix', year: 1999, mediaType: 'movie', aliases: [], typos: ['the matirx'], franchise: 'The Matrix' },
  { id: 'movie:578', title: 'Jaws', year: 1975, mediaType: 'movie', aliases: [], typos: ['jaw'] },
  { id: 'movie:1366', title: 'Rocky', year: 1976, mediaType: 'movie', aliases: [], typos: ['rockey'], franchise: 'Rocky' },
  { id: 'movie:238', title: 'The Godfather', year: 1972, mediaType: 'movie', aliases: [], typos: ['the godfater'], franchise: 'The Godfather' },
  { id: 'movie:496243', title: 'Parasite', year: 2019, mediaType: 'movie', aliases: [], typos: ['parasit'] },
  { id: 'movie:438631', title: 'Dune', year: 2021, mediaType: 'movie', aliases: [], typos: ['doone'] },
  { id: 'movie:19995', title: 'Avatar', year: 2009, mediaType: 'movie', aliases: [], typos: ['avator'], franchise: 'Avatar' },
  { id: 'movie:862', title: 'Toy Story', year: 1995, mediaType: 'movie', aliases: [], typos: ['toystory'], franchise: 'Toy Story' },
  { id: 'movie:557', title: 'Spider-Man', year: 2002, mediaType: 'movie', aliases: [], typos: ['spiderman', 'spidermon'], franchise: 'Spider-Man' },
  { id: 'movie:414906', title: 'The Batman', year: 2022, mediaType: 'movie', aliases: [], typos: ['the batmam'], franchise: 'Batman' },
  { id: 'tv:66732', title: 'Stranger Things', year: 2016, mediaType: 'tv', aliases: [], typos: ['stranger thing', 'stanger things'] },
  { id: 'tv:100088', title: 'The Last of Us', year: 2023, mediaType: 'tv', aliases: ['tlou'], typos: ['last of us'] },
  { id: 'tv:1429', title: 'Attack on Titan', year: 2013, mediaType: 'tv', aliases: ['aot'], typos: ['atack on titan'] },
  { id: 'tv:48891', title: 'Brooklyn Nine-Nine', year: 2013, mediaType: 'tv', aliases: ['b99'], typos: ['brooklyn 99'] },
  { id: 'movie:155', title: 'The Dark Knight', year: 2008, mediaType: 'movie', aliases: [], typos: ['dark night'], franchise: 'Batman' },
  { id: 'movie:680', title: 'Pulp Fiction', year: 1994, mediaType: 'movie', aliases: [], typos: ['pulpfiction'] },
  { id: 'movie:13', title: 'Forrest Gump', year: 1994, mediaType: 'movie', aliases: [], typos: ['forest gump'] },
  { id: 'movie:278', title: 'The Shawshank Redemption', year: 1994, mediaType: 'movie', aliases: [], typos: ['shawshank redemtion'] },
  { id: 'tv:60625', title: 'Rick and Morty', year: 2013, mediaType: 'tv', aliases: [], typos: ['rick n morty'] },
  { id: 'movie:335984', title: 'Blade Runner 2049', year: 2017, mediaType: 'movie', aliases: [], typos: ['blade runer 2049'] },
  { id: 'movie:76341', title: 'Mad Max: Fury Road', year: 2015, mediaType: 'movie', aliases: [], typos: ['mad max fury road'], franchise: 'Mad Max' },
  { id: 'tv:94605', title: 'Arcane', year: 2021, mediaType: 'tv', aliases: [], typos: ['arcaine'] },
];

/** Full catalog as retrieval Candidates from a given source (default fuzzy/index). */
export function catalogCandidates(source: Candidate['source'] = 'fuzzy_title'): Candidate[] {
  return CATALOG_TITLES.map((t) => ({
    id: t.id, title: t.title, year: t.year, mediaType: t.mediaType,
    source, sourceScore: 0.7, viaQuery: t.title.toLowerCase(),
  }));
}
