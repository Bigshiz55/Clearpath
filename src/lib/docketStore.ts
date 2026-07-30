'use client';

/**
 * THE DOCKET, CLIENT-SIDE.
 *
 * A tiny observable store rather than a context provider, because the W stamp
 * sits on cards rendered by server components all over the app — those cannot
 * be wrapped in a provider without turning half the product into client
 * components. Any island can subscribe.
 *
 * Local-only and deliberately so: the docket is tonight's question, not a
 * record of anything. It never touches the preference log, so building one and
 * abandoning it teaches the recommender nothing — which is right, because
 * "I considered this" is not a preference.
 */
import {
  addToDocket,
  pruneDocket,
  removeFromDocket,
  docketKey,
  type AddResult,
  type DocketEntry,
} from '@/lib/verdict/docket';

const KEY = 'wv.docket.v1';

let state: DocketEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function read(): DocketEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DocketEntry[];
    return Array.isArray(parsed) ? pruneDocket(parsed, Date.now()) : [];
  } catch {
    return [];
  }
}

function write(next: DocketEntry[]) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the docket still works for this page view */
  }
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  state = read();
  // Another tab is the same docket.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = read();
    for (const l of listeners) l();
  });
}

export function subscribeDocket(fn: () => void): () => void {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDocket(): DocketEntry[] {
  hydrate();
  return state;
}

/** Server snapshot for useSyncExternalStore — always empty, never the live set. */
export function getDocketServerSnapshot(): DocketEntry[] {
  return EMPTY;
}
const EMPTY: DocketEntry[] = [];

export function addToDocketStore(entry: Omit<DocketEntry, 'addedAt'>): AddResult {
  hydrate();
  const res = addToDocket(state, entry, Date.now());
  write(res.docket);
  return res;
}

export function removeFromDocketStore(key: string) {
  hydrate();
  write(removeFromDocket(state, key));
}

export function clearDocket() {
  hydrate();
  write([]);
}

export { docketKey };
export type { DocketEntry };
