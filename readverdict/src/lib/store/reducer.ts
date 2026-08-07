// Pure state reducer for the local store. All non-determinism (ids, timestamps)
// is injected via action payloads so this stays pure and unit-testable.

import { initialReaderDna, applyObservations, confirmDimension, type Observation } from '@/lib/domain/readerDna';
import type { AnalyticsEvent, AppealRecord, LibraryEntry, LocalState } from './types';

export const STATE_VERSION = 1;

export function initialLocalState(): LocalState {
  return {
    version: STATE_VERSION,
    onboarded: false,
    readerDna: initialReaderDna(),
    library: [],
    appeals: [],
    events: [],
    consent: { analytics: false, personalization: true },
  };
}

export type StoreAction =
  | { type: 'hydrate'; state: LocalState }
  | { type: 'add-to-library'; entry: LibraryEntry }
  | { type: 'update-entry'; id: string; patch: Partial<LibraryEntry> }
  | { type: 'remove-entry'; id: string }
  | { type: 'apply-observations'; observations: Observation[] }
  | { type: 'confirm-dimension'; key: string; value: number; at: string }
  | { type: 'set-onboarded'; value: boolean }
  | { type: 'record-appeal'; appeal: AppealRecord }
  | { type: 'record-event'; event: AnalyticsEvent }
  | { type: 'set-consent'; patch: Partial<LocalState['consent']> }
  | { type: 'reset-dna' }
  | { type: 'clear-all' };

export function reducer(state: LocalState, action: StoreAction): LocalState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'add-to-library': {
      // De-dupe by workId — updating status rather than adding twice.
      const existing = state.library.find((e) => e.book.workId === action.entry.book.workId);
      if (existing) {
        return {
          ...state,
          library: state.library.map((e) =>
            e.id === existing.id ? { ...e, status: action.entry.status } : e,
          ),
        };
      }
      return { ...state, library: [action.entry, ...state.library] };
    }
    case 'update-entry':
      return {
        ...state,
        library: state.library.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };
    case 'remove-entry':
      return { ...state, library: state.library.filter((e) => e.id !== action.id) };
    case 'apply-observations':
      return { ...state, readerDna: applyObservations(state.readerDna, action.observations) };
    case 'confirm-dimension':
      return {
        ...state,
        readerDna: confirmDimension(state.readerDna, action.key, action.value, action.at),
      };
    case 'set-onboarded':
      return { ...state, onboarded: action.value };
    case 'record-appeal':
      return { ...state, appeals: [action.appeal, ...state.appeals] };
    case 'record-event':
      // Keep a bounded ring of recent events locally.
      return { ...state, events: [action.event, ...state.events].slice(0, 500) };
    case 'set-consent':
      return { ...state, consent: { ...state.consent, ...action.patch } };
    case 'reset-dna':
      return { ...state, readerDna: initialReaderDna(), onboarded: false };
    case 'clear-all':
      return initialLocalState();
    default:
      return state;
  }
}
