'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { Observation } from '@/lib/domain/readerDna';
import type { DnfReason, UserBookStatus } from '@/lib/domain/userBook';
import { reducer, initialLocalState, STATE_VERSION, type StoreAction } from './reducer';
import type { AnalyticsEvent, BookRef, LibraryEntry, LocalState } from './types';

const STORAGE_KEY = 'readverdict.state.v1';

function uid(prefix: string): string {
  // Non-crypto local id; fine for local-only persistence.
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

interface StoreApi {
  state: LocalState;
  ready: boolean;
  addToLibrary: (book: BookRef, status: UserBookStatus, provenance?: string) => string;
  updateEntry: (id: string, patch: Partial<LibraryEntry>) => void;
  setStatus: (id: string, status: UserBookStatus, extra?: Partial<LibraryEntry>) => void;
  markDnf: (id: string, reason: DnfReason, page?: number) => void;
  removeEntry: (id: string) => void;
  applyObservations: (observations: Observation[]) => void;
  confirmDimension: (key: string, value: number) => void;
  setOnboarded: (value: boolean) => void;
  recordAppeal: (a: { entryId: string; progressPct?: number; page?: number; reason?: string; decision?: string; verdictWasAccurate?: boolean }) => void;
  track: (name: string, props?: Record<string, unknown>, version?: number) => void;
  setConsent: (patch: Partial<LocalState['consent']>) => void;
  resetDna: () => void;
  clearAll: () => void;
  dispatch: (a: StoreAction) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

function load(): LocalState {
  if (typeof window === 'undefined') return initialLocalState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialLocalState();
    const parsed = JSON.parse(raw) as LocalState;
    if (parsed.version !== STATE_VERSION) return initialLocalState();
    return { ...initialLocalState(), ...parsed };
  } catch {
    return initialLocalState();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialLocalState);
  const ready = useRef(false);

  // Hydrate from localStorage once on mount (client only) to avoid SSR mismatch.
  useEffect(() => {
    dispatch({ type: 'hydrate', state: load() });
    ready.current = true;
  }, []);

  // Persist on change.
  useEffect(() => {
    if (typeof window === 'undefined' || !ready.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota or privacy mode — degrade to in-memory only.
    }
  }, [state]);

  const api = useMemo<StoreApi>(() => {
    const now = () => new Date().toISOString();
    return {
      state,
      ready: ready.current,
      dispatch,
      addToLibrary(book, status, provenance = 'manual') {
        const id = uid('lib');
        const entry: LibraryEntry = {
          id,
          book,
          status,
          rating: null,
          dnfReason: null,
          dnfPage: null,
          startedAt: status === 'reading' ? now() : null,
          finishedAt: status === 'finished' ? now() : null,
          addedAt: now(),
          provenance,
        };
        dispatch({ type: 'add-to-library', entry });
        return id;
      },
      updateEntry(id, patch) {
        dispatch({ type: 'update-entry', id, patch });
      },
      setStatus(id, status, extra) {
        const patch: Partial<LibraryEntry> = { status, ...extra };
        if (status === 'reading' && !extra?.startedAt) patch.startedAt = now();
        if (status === 'finished' && !extra?.finishedAt) patch.finishedAt = now();
        dispatch({ type: 'update-entry', id, patch });
      },
      markDnf(id, reason, page) {
        dispatch({
          type: 'update-entry',
          id,
          patch: { status: 'dnf', dnfReason: reason, dnfPage: page ?? null },
        });
      },
      removeEntry(id) {
        dispatch({ type: 'remove-entry', id });
      },
      applyObservations(observations) {
        dispatch({ type: 'apply-observations', observations });
      },
      confirmDimension(key, value) {
        dispatch({ type: 'confirm-dimension', key, value, at: now() });
      },
      setOnboarded(value) {
        dispatch({ type: 'set-onboarded', value });
      },
      recordAppeal(a) {
        dispatch({
          type: 'record-appeal',
          appeal: {
            id: uid('appeal'),
            entryId: a.entryId,
            progressPct: a.progressPct ?? null,
            page: a.page ?? null,
            reason: a.reason ?? null,
            decision: a.decision ?? null,
            verdictWasAccurate: a.verdictWasAccurate ?? null,
            at: now(),
          },
        });
      },
      track(name, props = {}, version = 1) {
        const event: AnalyticsEvent = { id: uid('evt'), name, version, props, at: now() };
        dispatch({ type: 'record-event', event });
      },
      setConsent(patch) {
        dispatch({ type: 'set-consent', patch });
      },
      resetDna() {
        dispatch({ type: 'reset-dna' });
      },
      clearAll() {
        dispatch({ type: 'clear-all' });
      },
    };
  }, [state]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within <StoreProvider>');
  return ctx;
}
