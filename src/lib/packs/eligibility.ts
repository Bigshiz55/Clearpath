/**
 * DOES THIS PROGRAMME BELONG IN THIS PACK?
 *
 * THE DEFECT. `listPackBrowse` takes every programme that has aired on a Pack's
 * channels and shows it. There is no filter — not on media type, not on genre,
 * not on whether the thing is even entertainment. That is the whole mechanism,
 * and it explains every contaminated row anyone has reported:
 *
 *   Lifetime Movie Vault    Castle · The Rookie · Major Crimes ·
 *                           Joyce Meyer Enjoying Everyday Life ·
 *                           Dr. Pimple Popper
 *   Crime Case Files        Storage Wars · K9 PD With Jim Belushi ·
 *                           Natural Blood Pressure Management
 *
 * None of these is a data-quality problem in the listings. The listings are
 * correct: those programmes really did air on those channels. The product was
 * simply treating "aired on a Lifetime channel" as identical to "is a Lifetime
 * movie", and a channel's schedule is mostly not the thing the channel is known
 * for. Syndicated procedurals, paid religious programming and infomercials fill
 * daytime on almost every cable network.
 *
 * SO ELIGIBILITY IS EDITORIAL, NOT A CHANNEL LOOKUP. Each Pack declares what it
 * is FOR, and a programme has to satisfy that claim to appear. The Vault
 * promises "every thriller, true story, sequel and remake" — so it is
 * movie-centric by definition, and a long-running network procedural is out
 * however many times it airs. Crime Case Files promises to recognise a case you
 * have already seen — so a storage-locker auction show is out even though it
 * says "crime" nowhere near as loudly as it says "reality".
 *
 * WHY EXCLUSION IS BY RULE RATHER THAN BY BLOCKLIST. A list of banned titles
 * fixes the five rows in the screenshot and none of the ones nobody has looked
 * at yet. Every rule below is a property of the programme, so it generalises to
 * the schedule of any week.
 *
 * FAIL CLOSED, AND SAY WHY. An unclassifiable programme is excluded, and the
 * reason is returned rather than discarded, so "the Vault is empty" and "the
 * Vault filtered out 300 infomercials" are distinguishable to whoever has to
 * debug it.
 *
 * PURE. No I/O.
 */

/** What a Pack is editorially FOR. */
export type PackShape =
  /** Movies only, from this network's own catalogue. The Lifetime Vault. */
  | 'movie-vault'
  /** True-crime and crime documentary. Crime Case Files. */
  | 'crime-cases'
  /** Movies and specials, series allowed. The Hallmark Universe. */
  | 'seasonal-movies'
  /** No editorial claim — everything the channels carry. */
  | 'open';

export interface ProgrammeFacts {
  title: string;
  /** TMDB media type once matched. Null when the programme was never matched. */
  mediaType?: 'movie' | 'tv' | null;
  genres?: readonly string[] | null;
  releaseYear?: number | null;
  /** Episode count, when known. A 100-episode run is a series whatever it says. */
  episodeCount?: number | null;
  /** Runtime in minutes, when known. */
  runtimeMinutes?: number | null;
}

export interface Eligibility {
  eligible: boolean;
  /** Why not. Empty when eligible. Reported, never swallowed. */
  reason: string;
}

const OK: Eligibility = { eligible: true, reason: '' };
const no = (reason: string): Eligibility => ({ eligible: false, reason });

/**
 * PROGRAMMING THAT IS NOT ENTERTAINMENT.
 *
 * Paid religious programming, infomercials and home-shopping fill daytime on
 * cable and are the single largest source of contamination. Matched on title
 * patterns because that is genuinely what distinguishes them — TMDB usually has
 * no record of them at all, so there is no genre to filter on.
 *
 * DELIBERATELY NARROW. Each pattern targets a format, not a subject: "Natural
 * Blood Pressure Management" is an infomercial, and a documentary ABOUT
 * medicine is not. Broadening these to catch topics would start excluding real
 * programming, which is the more expensive mistake.
 */
const NOT_ENTERTAINMENT: readonly RegExp[] = [
  /\b(paid|infomercial|program(ming)? paid for)\b/i,
  /\b(shop|shopping)\s+(hq|network|channel)\b/i,
  // Televangelism / devotional strips. Named formats, not religion as a subject.
  /\b(joyce meyer|joel osteen|jimmy swaggart|creflo dollar|in touch ministries|hour of power|life today|the 700 club)\b/i,
  /\benjoying everyday life\b/i,
  // Direct-response health and finance strips.
  /\b(natural|proven|secret)\b.*\b(management|remedy|cure|solution)\b/i,
  /\b(wealth|retirement|credit)\s+(secrets|solutions|seminar)\b/i,
];

function isNotEntertainment(title: string): boolean {
  return NOT_ENTERTAINMENT.some((re) => re.test(title));
}

/** Reality/competition formats. Real programming, wrong shelf for a movie pack. */
const REALITY_GENRES = new Set([
  'reality',
  'reality-tv',
  'talk',
  'talk show',
  'news',
  'game show',
  'documentary series',
]);

const CRIME_GENRES = new Set(['crime', 'mystery', 'thriller', 'documentary']);

/**
 * Reality formats that describe themselves as crime and are not true crime.
 *
 * The distinction the Case Files product depends on is CASES — a real event with
 * victims, a place and a date, retold across programmes. An auction show is not
 * a case however often the word "crime" appears in its metadata.
 */
const NOT_A_CASE: readonly RegExp[] = [
  /\bstorage wars\b/i,
  /\b(pawn|auction|repo)\b/i,
  /\bk9 pd\b/i,
  /\bcops\b/i,
  /\blivepd\b|\blive pd\b/i,
  /\bjail\b/i,
];

/** A series masquerading as a movie because nothing matched it. */
function looksSerial(f: ProgrammeFacts): boolean {
  if ((f.episodeCount ?? 0) > 3) return true;
  // A 42-minute "movie" is a drama episode.
  if (f.runtimeMinutes != null && f.runtimeMinutes > 0 && f.runtimeMinutes < 55) return true;
  return false;
}

export function isEligible(shape: PackShape, f: ProgrammeFacts): Eligibility {
  const title = (f.title ?? '').trim();
  if (!title) return no('no title');

  // Applies to every shape including `open`: an infomercial is not a
  // destination's content on any editorial reading.
  if (isNotEntertainment(title)) return no('not entertainment programming');

  const genres = (f.genres ?? []).map((g) => g.toLowerCase());

  switch (shape) {
    case 'movie-vault': {
      /* MOVIE-CENTRIC BY DEFINITION. The Vault's promise is "every thriller,
         true story, sequel and remake before they start blending together" —
         a promise about a film library. Castle airing at 2pm is not part of it. */
      if (f.mediaType === 'tv') return no('series, and this Pack is a movie vault');
      if (f.mediaType == null) return no('unmatched — cannot confirm it is a film');
      if (looksSerial(f)) return no('runtime/episode count indicates an episode, not a film');
      if (genres.some((g) => REALITY_GENRES.has(g))) return no('reality or talk format');
      return OK;
    }

    case 'crime-cases': {
      if (NOT_A_CASE.some((re) => re.test(title))) return no('reality format, not a case');
      if (genres.length === 0) return no('unclassified — cannot confirm it is crime');
      if (!genres.some((g) => CRIME_GENRES.has(g))) return no('not crime or documentary');
      return OK;
    }

    case 'seasonal-movies': {
      if (genres.some((g) => REALITY_GENRES.has(g) && g !== 'documentary series')) {
        return no('reality or talk format');
      }
      return OK;
    }

    case 'open':
    default:
      return OK;
  }
}

/** Filter a list, keeping the rejections so they can be reported. */
export function partitionEligible<T extends ProgrammeFacts>(
  shape: PackShape,
  rows: readonly T[],
): { kept: T[]; rejected: Array<{ row: T; reason: string }> } {
  const kept: T[] = [];
  const rejected: Array<{ row: T; reason: string }> = [];
  for (const row of rows) {
    const verdict = isEligible(shape, row);
    if (verdict.eligible) kept.push(row);
    else rejected.push({ row, reason: verdict.reason });
  }
  return { kept, rejected };
}

/**
 * Each Pack's editorial shape.
 *
 * Keyed by slug rather than branched on inside the Pack code, because CLAUDE.md
 * forbids switching on a Pack slug in shared logic — this is DATA that the
 * shared path reads, which is the same discipline `packChannelMap` already uses
 * for channels.
 */
export const PACK_SHAPES: Readonly<Record<string, PackShape>> = {
  'lifetime-movie-vault': 'movie-vault',
  'lifetime': 'movie-vault',
  'crime-case-files': 'crime-cases',
  'true-crime': 'crime-cases',
  'hallmark': 'seasonal-movies',
  'hallmark-universe': 'seasonal-movies',
};

export function shapeForPack(slug: string): PackShape {
  return PACK_SHAPES[slug] ?? 'open';
}
