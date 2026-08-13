// Book-data provider abstraction. The app talks to providers through this
// interface, never to a specific vendor, so sources can be added, reordered, or
// mocked without touching product code.

/**
 * The distinct states a data request can end in. Crucially, "unavailable" is
 * NEVER represented as zero — a missing rating and a genuine zero rating are
 * different facts and the UI must be able to tell them apart.
 */
export type DataState =
  | 'ok'
  | 'no_data' // provider responded but has nothing for this query
  | 'not_requested' // we chose not to ask (e.g. feature disabled)
  | 'provider_failure' // the provider errored / timed out
  | 'not_applicable' // the field does not apply to this item
  | 'genuine_zero' // a real, measured zero
  | 'insufficient_sample'; // data exists but sample is too small to trust

export interface ProviderResult<T> {
  state: DataState;
  data: T | null;
  source: string;
  retrievedAt: string;
  error?: string;
}

export interface BookQuery {
  q?: string;
  title?: string;
  author?: string;
  isbn?: string;
  limit?: number;
}

/** A provider's normalized view of a book (maps into the domain Work/Edition). */
export interface ProviderBook {
  source: string;
  sourceId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  firstPublishYear: number | null;
  isbn13: string | null;
  isbn10: string | null;
  coverUrl: string | null;
  subjects: string[];
  languages: string[];
  pageCount: number | null;
  /** Aggregate rating on a 0..5 scale, or null when unrated. */
  rating: { average: number; count: number } | null;
}

export interface ProviderHealth {
  source: string;
  healthy: boolean;
  checkedAt: string;
  note?: string;
}

export interface BookProvider {
  key: string;
  displayName: string;
  /** True for development/fixture providers — surfaced in the UI, never hidden. */
  isMock?: boolean;
  search(q: BookQuery): Promise<ProviderResult<ProviderBook[]>>;
  getByIsbn?(isbn: string): Promise<ProviderResult<ProviderBook | null>>;
  health(): Promise<ProviderHealth>;
}
