import 'server-only';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';

// Lines that show up on a paused TV / streaming screen but aren't the title.
const JUNK =
  /^(play|resume|watch( now)?|continue( watching)?|trailer|preview|episode|season|s\d+|e\d+|ep\.?\s*\d+|\d+\s*(min|m|h|hr|seasons?|episodes?)|hd|4k|uhd|cc|sd|dolby|tv-\w+|pg(-13)?|nc-17|rated\s+\w+|new episode|my list|add to.*|watchlist|details|more info|now playing|paused|live|on now|record|dvr|guide|info|back|home|menu|settings|\d{1,2}:\d{2}|★+|imdb|rotten)$/i;

function candidates(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const lines = text
    .split(/[\n\r]+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Drop obvious UI chrome and very long lines (those are descriptions, not titles).
    .filter((l) => l.length >= 2 && l.length <= 60 && !JUNK.test(l));
  const set = new Set<string>();
  for (const l of lines.slice(0, 10)) set.add(l);
  if (cleaned) set.add(cleaned.slice(0, 60));
  return Array.from(set).slice(0, 10);
}

function score(cand: string, r: SearchResultItem): number {
  const a = cand.toLowerCase();
  const b = r.title.toLowerCase();
  let s = 0;
  if (a === b) s += 100;
  else if (a.startsWith(b) || b.startsWith(a)) s += 62;
  else if (a.includes(b) || b.includes(a)) s += 38;
  s += Math.min(22, (r.popularity ?? 0) / 20);
  s += Math.min(8, (r.voteAverage ?? 0));
  return s;
}

/**
 * Resolve a title from free/OCR text. Tries the whole string plus each plausible
 * line (dropping UI chrome), searches TMDB for each, and returns the best match —
 * so a messy screenshot of a paused show still finds the right title.
 */
export async function resolveTitleFromText(text: string): Promise<SearchResultItem | null> {
  const cands = candidates(text);
  if (cands.length === 0) return null;
  let best: { r: SearchResultItem; s: number } | null = null;
  // Search candidates with light concurrency.
  const results = await Promise.all(
    cands.map(async (c) => {
      try {
        return { c, list: await searchTitles(c) };
      } catch {
        return { c, list: [] as SearchResultItem[] };
      }
    }),
  );
  for (const { c, list } of results) {
    for (const r of list.slice(0, 5)) {
      const s = score(c, r);
      if (!best || s > best.s) best = { r, s };
    }
  }
  return best?.r ?? null;
}
