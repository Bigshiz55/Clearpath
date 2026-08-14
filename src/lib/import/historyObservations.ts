/**
 * REAL HISTORY → RAPID-FIRE OBSERVATIONS.
 *
 * The bridge from the user's OWN stored history (watchlist rows — the place
 * `importParsedTitles` lands an import after the person reviewed it, and the
 * place manual "watched"/"stopped watching" marks live) into the pure
 * rapid-fire queue builder. This is what makes Rapid Fire a real instrument
 * instead of the sample-data demo: the questions are about titles the user's
 * actual history says they watched.
 *
 * THE EVIDENCE RULE. A question may never imply something the data does not
 * say. Every observation's evidence line is printed from the row itself —
 * status and date — and rows that cannot honestly support a question are
 * excluded:
 *
 *   • `watched`  → "You watched this. How was it?" — the row IS the user's
 *     own record of having watched it (imported after review, or marked by
 *     hand). Evidence carries the recorded date when there is one.
 *   • `dropped`  → the abandoned question — the heaviest signal available.
 *   • rows WITH a rating are excluded: the opinion already exists, and
 *     asking again invites a contradiction we'd then have to arbitrate.
 *   • every other status (possible/watching/…) is excluded: "you saved
 *     this" is not "you watched this", and the question text would lie.
 *
 * PURE. No I/O, no clock.
 */
import { normaliseKey, type Observation } from './rapidFire';

export interface HistoryRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  status: string;
  rating: number | null;
  watched_at: string | null;
}

/** What the live answer path needs to persist against a queue item. */
export interface TitleRef {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
}

export interface HistoryObservations {
  observations: Observation[];
  /** queue key (normaliseKey) → the real title identity behind it. */
  refs: Map<string, TitleRef>;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function historyToObservations(rows: readonly HistoryRow[]): HistoryObservations {
  const observations: Observation[] = [];
  const refs = new Map<string, TitleRef>();

  for (const r of rows) {
    if (!r.title?.trim()) continue;
    if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
    // An existing rating IS the opinion — nothing to ask.
    if (r.rating != null) continue;

    let o: Observation | null = null;
    if (r.status === 'watched') {
      const date = fmtDate(r.watched_at);
      o = {
        title: r.title,
        mediaType: r.media_type,
        context: 'viewing_history',
        evidence: date ? `In your history as watched on ${date}.` : 'In your history as watched.',
        lastWatched: r.watched_at,
      };
    } else if (r.status === 'dropped') {
      o = {
        title: r.title,
        mediaType: r.media_type,
        context: 'continue_watching',
        evidence: 'In your history as stopped watching.',
        lastWatched: r.watched_at,
        abandoned: true,
      };
    }
    if (!o) continue;

    const key = normaliseKey(o.title, o.mediaType);
    if (!refs.has(key)) {
      refs.set(key, { tmdbId: r.tmdb_id, mediaType: r.media_type, title: r.title });
      observations.push(o);
    }
  }

  return { observations, refs };
}
