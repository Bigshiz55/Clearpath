// Canonical book data model. The central distinction: a conceptual WORK versus
// its individual EDITIONS. A hardcover, paperback, Kindle edition, translation,
// large-print, and audiobook can all belong to one work while differing in
// identifiers, page counts, narrators, publishers, dates, availability, and
// covers. Externally-sourced, conflict-prone fields are carried as SourcedValue
// so provenance and confidence travel with the data.

import type { SourcedValue } from './provenance';

/** Convenience alias: an attribute that carries provenance + confidence. */
export type Attr<T> = SourcedValue<T>;

export type BookFormat =
  | 'hardcover'
  | 'paperback'
  | 'mass_market'
  | 'ebook'
  | 'audiobook'
  | 'large_print'
  | 'other';

export type ContributorRole =
  | 'author'
  | 'co-author'
  | 'translator'
  | 'illustrator'
  | 'editor'
  | 'narrator'
  | 'foreword'
  | 'contributor';

/** A person (author, narrator, translator, …). */
export interface Person {
  id: string;
  name: string;
  /** Alternate/transliterated name forms for multilingual matching. */
  alternateNames?: string[];
  altIds?: AlternateId[];
}

export interface WorkContributor {
  person: Person;
  role: ContributorRole;
  /** Display order among contributors of the same role. */
  order?: number;
}

/** An external identifier, e.g. an Open Library work key or a Goodreads id. */
export interface AlternateId {
  scheme: string; // 'openlibrary-work' | 'openlibrary-edition' | 'goodreads' | 'asin' | 'oclc' | 'lccn' | ...
  value: string;
}

export interface SeriesRef {
  id: string;
  name: string;
  /** Position within the series (1-based). Fractional for e.g. book 1.5. */
  position?: number | null;
  /** Total known entries, when known. */
  total?: number | null;
}

/** A 0..1 interpretable Book-DNA axis with salience and confidence. */
export interface BookDnaAxis {
  /** 0..1 on the axis (semantics documented per-field below). */
  value: number;
  /** 0..1 — how defining this trait is for the book (vs. incidental). */
  salience: number;
  /** 0..1 — how sure we are of the value. */
  confidence: number;
}

export type ChapterLength = 'short' | 'medium' | 'long' | 'varied' | 'unknown';
export type PointOfView = 'first' | 'second' | 'third' | 'multiple' | 'unknown';
export type Tense = 'past' | 'present' | 'mixed' | 'unknown';
export type EndingStyle = 'resolved' | 'ambiguous' | 'cliffhanger' | 'twist' | 'unknown';

export interface ContentWarning {
  label: string; // e.g. 'graphic violence', 'sexual assault'
  /** 0..1 intensity, or null when only presence is known. */
  intensity: number | null;
  status: SourcedValue<boolean>['status'];
}

/**
 * Interpretable characteristics of a WORK. All numeric axes are 0..1. Missing
 * axes are simply absent — never defaulted to a fabricated midpoint.
 */
export interface BookDna {
  /** 0 = slow burn, 1 = breakneck. */
  pacing?: BookDnaAxis;
  /** 0 = simple, 1 = highly complex. */
  complexity?: BookDnaAxis;
  /** 0 = light, 1 = very dark. */
  darkness?: BookDnaAxis;
  /** 0 = fully character-driven, 1 = fully plot-driven. */
  plotVsCharacter?: BookDnaAxis;
  /** 0 = sparse, 1 = very dense prose. */
  proseDensity?: BookDnaAxis;
  /** 0 = none, 1 = elaborate worldbuilding. */
  worldbuilding?: BookDnaAxis;
  /** 0 = none, 1 = romance-centered. */
  romanceEmphasis?: BookDnaAxis;
  /** 0 = none, 1 = explicit (spice). */
  spice?: BookDnaAxis;
  /** 0 = none, 1 = very funny. */
  humor?: BookDnaAxis;
  /** 0 = flat, 1 = intense emotional impact. */
  emotionalIntensity?: BookDnaAxis;
  /** 0 = none, 1 = high-tension suspense. */
  suspense?: BookDnaAxis;
  /** 0 = commercial, 1 = literary. */
  literaryVsCommercial?: BookDnaAxis;

  moods: string[];
  tropes: string[];
  themes: string[];
  contentWarnings: ContentWarning[];

  chapterLength: ChapterLength;
  pov: PointOfView;
  tense: Tense;
  endingStyle: EndingStyle;
  unreliableNarrator?: boolean | null;
  nonlinearTimeline?: boolean | null;
  standalone?: boolean | null;
}

/** Aggregate rating from one source, sample-size aware. */
export interface RatingAggregate {
  /** Average on a 0..5 scale (normalize other scales to this). */
  average: number;
  count: number;
  scaleMax: 5;
}

export type AvailabilityChannel =
  | 'print'
  | 'ebook'
  | 'audiobook'
  | 'library'
  | 'libby'
  | 'kindle'
  | 'kindle-unlimited'
  | 'audible'
  | 'everand'
  | 'kobo'
  | 'kobo-plus'
  | 'apple-books'
  | 'google-play'
  | 'retailer'
  | 'user-owned';

export type AvailabilityKind =
  | 'borrow' // available to borrow now
  | 'hold' // available but a hold/wait is required
  | 'subscription' // included in a subscription
  | 'purchase' // available to buy
  | 'owned' // the user already owns it
  | 'sample' // a sample/preview is available
  | 'public-domain'; // free, public domain

export interface AvailabilityOption {
  channel: AvailabilityChannel;
  kind: AvailabilityKind;
  region?: string | null;
  /** Price in minor units + currency, only when a real price is known. */
  priceMinor?: number | null;
  currency?: string | null;
  url?: string | null;
  /** Provenance for the availability claim — never asserted without a source. */
  source: string;
  retrievedAt?: string | null;
}

/** A single physical/digital edition of a work. */
export interface Edition {
  id: string;
  workId: string;
  format: BookFormat;
  isbn13?: string | null;
  isbn10?: string | null;
  altIds: AlternateId[];
  publisher?: Attr<string> | null;
  publishedDate?: Attr<string> | null;
  language?: string | null;
  pageCount?: Attr<number> | null;
  audioDurationMin?: Attr<number> | null;
  narrators?: string[];
  coverUrl?: string | null;
  region?: string | null;
  rating?: Attr<RatingAggregate> | null;
  availability: AvailabilityOption[];
}

/** The conceptual work — edition-independent identity and interpreted DNA. */
export interface Work {
  id: string;
  title: string;
  subtitle?: string | null;
  originalTitle?: string | null;
  contributors: WorkContributor[];
  series?: SeriesRef | null;
  firstPublishYear?: Attr<number> | null;
  originalLanguage?: string | null;
  subjects: string[];
  bookDna: BookDna;
  identifiers: AlternateId[];
  /** Editions belonging to this work. */
  editions: Edition[];
}

/** Convenience: the primary author display string for a work. */
export function primaryAuthor(work: Work): string | null {
  const authors = work.contributors
    .filter((c) => c.role === 'author' || c.role === 'co-author')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return authors[0]?.person.name ?? null;
}

/** An empty Book DNA — everything unknown, nothing fabricated. */
export function emptyBookDna(): BookDna {
  return {
    moods: [],
    tropes: [],
    themes: [],
    contentWarnings: [],
    chapterLength: 'unknown',
    pov: 'unknown',
    tense: 'unknown',
    endingStyle: 'unknown',
    unreliableNarrator: null,
    nonlinearTimeline: null,
    standalone: null,
  };
}
