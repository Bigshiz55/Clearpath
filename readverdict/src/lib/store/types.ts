// Local persistence model. This is the source of truth for the credential-free
// local experience. The same shapes map onto the Supabase tables (migration
// 0001) so a server-backed repository can replace the local one behind the same
// hooks once auth is configured — see docs/PRIVACY.md and ARCHITECTURE.md.

import type { ReaderDna } from '@/lib/domain/readerDna';
import type { UserBookStatus, DnfReason } from '@/lib/domain/userBook';

/** A compact reference to a book, enough to render cards and re-run a trial. */
export interface BookRef {
  workId: string;
  title: string;
  author: string | null;
  year: number | null;
  coverUrl: string | null;
  isbn13: string | null;
  subjects: string[];
  pageCount: number | null;
  rating: { average: number; count: number } | null;
  /** Source key for attribution (e.g. 'openlibrary', 'mock'). */
  source: string;
}

export interface LibraryEntry {
  id: string;
  book: BookRef;
  status: UserBookStatus;
  rating: number | null;
  dnfReason: DnfReason | null;
  dnfPage: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  addedAt: string;
  /** How this entry entered the library (import, search, onboarding). */
  provenance: string;
}

export interface AppealRecord {
  id: string;
  entryId: string;
  progressPct: number | null;
  page: number | null;
  reason: string | null;
  decision: string | null;
  verdictWasAccurate: boolean | null;
  at: string;
}

export interface AnalyticsEvent {
  id: string;
  name: string;
  version: number;
  props: Record<string, unknown>;
  at: string;
}

export interface Consent {
  analytics: boolean;
  personalization: boolean;
}

export interface LocalState {
  version: number;
  onboarded: boolean;
  readerDna: ReaderDna;
  library: LibraryEntry[];
  appeals: AppealRecord[];
  events: AnalyticsEvent[];
  consent: Consent;
}
