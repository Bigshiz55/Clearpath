/**
 * Sports exclusion — PURE. This phase ships NO sports. Sports are filtered out of
 * every query, section, card, and recommendation. The exclusion is centralized
 * here so enabling sports later is a one-place change, not a rebuild.
 *
 * EXTENSION POINT (future sports phase):
 *   1. Remove 'sports' from DEFAULT_EXCLUDED_EVENT_TYPES (or make it query-driven).
 *   2. Add a sports-specific enrichment path (teams/leagues/live-score) keyed off
 *      Program.eventType === 'sports' — the type already exists in the model.
 *   3. Add a 'Sports' view to the view registry; nothing else needs to change.
 * The data model (EventType, Program, Airing) is already sports-capable.
 */
import type { EventType, Program, Channel } from './types';

/** Event types hidden this phase. Sports is the only one; kept as a set so the
 *  future phase can shrink it without touching call sites. */
export const DEFAULT_EXCLUDED_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>(['sports']);

/** Channel call-signs / network keys that are sports-only — filtered even if a raw
 *  feed mislabels an event's type. Mirrors the existing TVmaze/Gracenote skip set. */
const SPORTS_CHANNEL_RE =
  /\b(espn|fs1|fs2|fox sports|nbc sports|cbs sports|cbssn|nfl network|nba tv|mlb network|nhl network|golf channel|tennis channel|sec network|acc network|big ?ten|willow|beIN|gol tv)\b/i;

const SPORTS_GENRE_RE = /\b(sport|sports)\b/i;

/** Is this program a sports event? (type, genre, or obvious title/League cues.) */
export function isSportsProgram(p: Pick<Program, 'eventType' | 'genres' | 'title'>): boolean {
  if (p.eventType === 'sports') return true;
  if (p.genres.some((g) => SPORTS_GENRE_RE.test(g))) return true;
  return false;
}

export function isSportsChannel(c: Pick<Channel, 'callSign' | 'network' | 'name'>): boolean {
  return SPORTS_CHANNEL_RE.test(`${c.callSign} ${c.network ?? ''} ${c.name}`);
}

/** Normalize a raw feed "showType" string into our EventType, mapping sports so it
 *  can be filtered. Unknown types fall to 'other', never silently dropped. */
export function eventTypeFromRaw(showType: string | null | undefined, genres: string[] = []): EventType {
  const t = (showType ?? '').toLowerCase();
  if (t.includes('sport') || genres.some((g) => SPORTS_GENRE_RE.test(g))) return 'sports';
  if (t.includes('movie') || t === 'film') return 'movie';
  if (t.includes('news')) return 'news';
  if (t.includes('doc')) return 'documentary';
  if (t.includes('award')) return 'awards';
  if (t.includes('kid') || t.includes('child')) return 'kids';
  if (t.includes('special')) return 'special';
  if (t.includes('scripted') || t.includes('episode') || t.includes('series') || t.includes('reality')) return 'episode';
  return 'other';
}

/** Drop every sports airing (by program type/genre OR sports-only channel). */
export function excludeSports<T extends { program: Program; channel: Channel }>(items: T[]): T[] {
  return items.filter((x) => !isSportsProgram(x.program) && !isSportsChannel(x.channel));
}
