/**
 * TONIGHT'S HIGHLIGHTS — one card per SHOW, not one per airing.
 *
 * "World War II with Tom Hanks" took two of the six highlight slots: an 8:00
 * episode and a 9:00 episode, both with the same rating, both surfacing.
 * A back-to-back double bill is one thing to watch, and a strip that answers
 * "what's on tonight?" by naming the same programme twice has spent a third of
 * itself saying nothing new.
 *
 * The full list below the strip is untouched — every airing still appears
 * there, because that IS the schedule. This only governs the shortlist.
 *
 * The extra showings are not discarded either: they come back as `others`, so
 * a card can say "also at 9:00" instead of silently dropping a time somebody
 * might have been planning around.
 *
 * Pure. No I/O, no clock.
 */
import { normalizeTitle } from '@/lib/nlu/titleNormalize';

export interface ShowAiring {
  /** Unique per AIRING, not per show. */
  id: number;
  /** The show's TMDB id when we resolved one — the strongest identity we have. */
  tmdbId?: number | null;
  mediaType?: 'movie' | 'tv' | null;
  showName: string;
  /** Minutes into the day. Used to choose which airing represents the show. */
  minutes: number;
}

/**
 * What counts as "the same show".
 *
 * A resolved TMDB id when we have one. Otherwise the name, normalized — the
 * schedule feed is not consistent about punctuation or case, and "POV" and
 * "P.O.V." are one programme.
 */
export function showKey(a: ShowAiring): string {
  if (a.tmdbId != null) return `${a.mediaType ?? 'tv'}:${a.tmdbId}`;
  const name = collapseInitialisms(normalizeTitle(a.showName ?? ''));
  return `name:${name || `id-${a.id}`}`;
}

/**
 * "p o v" → "pov", "s w a t" → "swat".
 *
 * Normalizing punctuation to spaces is right for ordinary titles and wrong for
 * initialisms: the same programme arrives as "P.O.V." from one feed and "POV"
 * from another, and those must not be two shows. Only runs of TWO OR MORE
 * single letters collapse — otherwise "A Man Called Otto" would lose its
 * article into the next word.
 */
function collapseInitialisms(s: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const token of s.split(' ')) {
    if (token.length === 1 && /[a-z]/.test(token)) run.push(token);
    else {
      flush();
      if (token) out.push(token);
    }
  }
  flush();
  return out.join(' ');
}

export interface ShowGroup<T> {
  /** The airing that represents this show in the strip. */
  pick: T;
  /** Its other airings in the same window, earliest first. */
  others: T[];
}

/**
 * Group airings by show, preserving the caller's ordering.
 *
 * The REPRESENTATIVE is the earliest airing — if a show is on at 8 and again at
 * 9, the useful card is the one you can still catch from the start. The group
 * keeps its position from wherever its first member appeared, so a rating sort
 * or a soonest-first sort survives intact.
 */
export function groupByShow<T extends ShowAiring>(airings: readonly T[]): ShowGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const a of airings) {
    const k = showKey(a);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(a);
    else {
      byKey.set(k, [a]);
      order.push(k);
    }
  }
  return order.map((k) => {
    const all = [...byKey.get(k)!].sort((x, y) => x.minutes - y.minutes);
    const [pick, ...others] = all;
    return { pick: pick!, others };
  });
}

/** The shortlist: one airing per show. */
export function dedupeByShow<T extends ShowAiring>(airings: readonly T[]): T[] {
  return groupByShow(airings).map((g) => g.pick);
}

/**
 * "Also at 9:00 PM" — the line a deduped card adds so the showings it stands in
 * for are not silently lost.
 *
 * Takes ALREADY-FORMATTED times, because the only caller renders clock times in
 * the viewer's own zone from an airstamp, not from minutes — a formatter taking
 * minutes could not produce what the card actually shows.
 *
 * Returns null when there is nothing extra to say, so the card renders no line
 * rather than an empty one.
 */
export function repeatNote(times: readonly (string | null | undefined)[]): string | null {
  const shown = times.filter((t): t is string => !!t && t.trim().length > 0);
  if (shown.length === 0) return null;
  if (shown.length <= 2) return `Also at ${shown.join(', ')}`;
  return `Also at ${shown.slice(0, 2).join(', ')} +${shown.length - 2} more`;
}
