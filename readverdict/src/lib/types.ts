// Shared domain types for ReadVerdict. These are plain data — no I/O, no
// framework types — so both the pure scoring engine and the UI can depend on
// them freely.

export type Confidence = 'low' | 'medium' | 'high';

/** How a title can be read, straight from Open Library's `ebook_access`. */
export type EbookAccess =
  | 'public' // full text readable free (public domain)
  | 'borrowable' // lend via Internet Archive / library
  | 'printdisabled' // restricted to print-disabled patrons
  | 'no_ebook' // no digital copy known
  | 'unknown';

/**
 * Everything the deterministic engine needs to score a book. Every field is
 * either real data from Open Library or an honest `null` — the engine never
 * invents a rating, a page count, or availability it does not have.
 */
export interface BookMetadata {
  /** Open Library work key without the `/works/` prefix, e.g. `OL45804W`. */
  workId: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  firstPublishYear: number | null;
  /** Open Library cover id (`cover_i`), or null when no cover is known. */
  coverId: number | null;
  /** Median page count across editions, or null when unknown. */
  pageCount: number | null;
  /** Number of known editions — a proxy for reach and staying power. */
  editionCount: number;
  subjects: string[];
  /** ISO-ish language codes from Open Library (e.g. `eng`, `fre`). */
  languages: string[];
  /** Average rating on a 1–5 scale, or null when nobody has rated it. */
  ratingsAverage: number | null;
  ratingsCount: number;
  /** Total reading-log entries (want-to-read + reading + read). */
  readingLogCount: number;
  wantToReadCount: number;
  currentlyReadingCount: number;
  alreadyReadCount: number;
  ebookAccess: EbookAccess;
  /** First-party description text, or null when Open Library has none. */
  description: string | null;
}

/** One rating feed, shown transparently in the consensus. */
export interface RatingSource {
  name: string;
  /** Normalized 0–100 value, or null when unavailable. */
  value: number | null;
  /** Human-readable raw form, e.g. "4.2/5 (318 ratings)". */
  raw: string | null;
  available: boolean;
  /** Effective share of the blended acclaim number, when it contributed. */
  weight?: number;
}

export interface ScoreBreakdown {
  /** Blended reader/critic acclaim. */
  acclaim: number;
  /** Log-scaled reach from reading-log activity. */
  popularity: number;
  /** Approachability: length commitment and language. */
  readability: number;
  /** Endurance: editions in print and how long it has lasted. */
  stayingPower: number;
  dataReliability: Confidence;
}

export interface ReadVerdictScore {
  /** The headline 0–100 ReadVerdict Score. */
  score: number;
  breakdown: ScoreBreakdown;
  confidence: Confidence;
  sources: RatingSource[];
  /** The confidence-weighted acclaim blend, exposed for transparency. */
  acclaimScore: number;
  acclaimConfidence: Confidence;
}

export type VerdictTier =
  | 'Must Read'
  | 'Strong Read'
  | 'Worth Reading'
  | 'Possible Read'
  | 'Low Priority'
  | 'Skip';

export type PrimaryCall = 'READ IT' | 'MAYBE' | 'SKIP IT';

/** A labelled, honest reading signal (length, era, availability, …). */
export interface ContentSignal {
  label: string;
  /** Optional qualitative level, when the signal is a scale. */
  level?: 'none' | 'low' | 'moderate' | 'high' | 'unknown';
  /** Free-text note, e.g. "≈ 6h at 250 wpm". */
  note?: string;
}

/** Where a reader can legally get the book. */
export interface ReadingOption {
  label: string;
  detail: string;
  /** External link (Open Library / Internet Archive), when we have one. */
  href: string | null;
  kind: 'read-free' | 'borrow' | 'buy' | 'info';
}

export interface VerdictReport {
  book: BookMetadata;
  general: ReadVerdictScore;
  primaryCall: PrimaryCall;
  tier: VerdictTier;
  oneLiner: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  signals: ContentSignal[];
  readingOptions: ReadingOption[];
  /** ISO timestamp; injected for determinism/testability. */
  generatedAt: string;
}
