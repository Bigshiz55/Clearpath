'use client';

/**
 * THE R DOCKET, CLIENT-SIDE.
 *
 * The W docket's twin, on its own storage key so the two never mix — a title
 * you are considering for tonight and a title you are considering revisiting
 * are different lists, and merging them would make both rulings wrong.
 *
 * Local-only for the same reason as the W docket: this is tonight's question,
 * not a record. It never writes to the preference log, so building an R docket
 * and abandoning it teaches the recommender nothing.
 */
import {
  addToRDocket,
  docketKey,
  pruneDocket,
  removeFromDocket,
  type DocketEntry,
  type RAddResult,
} from '@/lib/reverdict/docket';

const KEY = 'wv.rdocket.v1';

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
    /* private mode — it still works for this page view */
  }
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  state = read();
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = read();
    for (const l of listeners) l();
  });
}

export function subscribeRDocket(fn: () => void): () => void {
  hydrate();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getRDocket(): DocketEntry[] {
  hydrate();
  return state;
}

const EMPTY: DocketEntry[] = [];
/** Server snapshot for useSyncExternalStore — always empty, never the live set. */
export function getRDocketServerSnapshot(): DocketEntry[] {
  return EMPTY;
}

export function addToRDocketStore(entry: Omit<DocketEntry, 'addedAt'>): RAddResult {
  hydrate();
  const res = addToRDocket(state, entry, Date.now());
  write(res.docket);
  return res;
}

export function removeFromRDocketStore(key: string) {
  hydrate();
  write(removeFromDocket(state, key));
}

export function clearRDocket() {
  hydrate();
  write([]);
}

export { docketKey };
export type { DocketEntry };
