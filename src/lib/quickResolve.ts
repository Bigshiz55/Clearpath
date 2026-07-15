import 'server-only';
import { searchTitles, type SearchResultItem } from '@/lib/tmdb/client';

const JUNK =
  /^(play|resume|watch( now)?|continue( watching)?|trailer|preview|record|remind|other times|movie info|episode|season|s\d+|e\d+|ep\.?\s*\d+|\d+\s*(min|m|h|hr|seasons?|episodes?)|hd|4k|uhd|fxhd|cc|sd|dolby|tv-\w+|pg(-13)?|nc-17|rated\s+\w+|new episode|my list|add to.*|watchlist|details|more info|now playing|paused|live|on now|dvr|guide|info|back|home|menu|settings|\d{1,2}:\d{2}\s*[ap]?m?|★+|\d+%)$/i;

function normalizeLine(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^\d{1,4}\s+/, '') // leading channel numbers
    .replace(/^\d{1,2}:\d{2}\s*[-–]?\s*\d{0,2}:?\d{0,2}\s*[ap]?m?\.?\s*/i, '') // leading times
    .replace(/\(\d{4}\).*$/, '') // drop "(2004) description…"
    .trim();
}

/** Candidate title phrases from noisy OCR: cleaned lines + short word-windows. */
function candidates(text: string): string[] {
  const set = new Set<string>();
  for (const rawLine of text.split(/[\n\r]+/)) {
    const line = normalizeLine(rawLine);
    if (line.length < 2) continue;
    if (line.length >= 2 && line.length <= 70 && !JUNK.test(line)) set.add(line);
    const words = line.split(' ').filter(Boolean);
    // Sliding windows (2–6 words) catch a title embedded in a busy line.
    for (let n = Math.min(6, words.length); n >= 2; n--) {
      for (let i = 0; i + n <= words.length && i < 5; i++) {
        const w = words.slice(i, i + n).join(' ');
        if (w.length >= 4 && w.length <= 50 && !JUNK.test(w)) set.add(w);
      }
    }
  }
  return Array.from(set).slice(0, 16);
}

function score(cand: string, r: SearchResultItem): number {
  const a = cand.toLowerCase();
  const b = r.title.toLowerCase();
  let s = 0;
  if (a === b) s += 100;
  else if (a.startsWith(b) || b.startsWith(a)) s += 60;
  else if (a.includes(b) || b.includes(a)) s += 32;
  else return -1; // no textual overlap — ignore
  s += Math.min(20, (r.popularity ?? 0) / 25);
  s += Math.min(8, r.voteAverage ?? 0);
  return s;
}

/** Ranked, de-duplicated title matches from free/OCR text (best first). */
export async function resolveCandidatesFromText(text: string, limit = 6): Promise<SearchResultItem[]> {
  const cands = candidates(text);
  if (cands.length === 0) return [];
  const searched = await Promise.all(
    cands.map(async (c) => {
      try {
        return { c, list: await searchTitles(c) };
      } catch {
        return { c, list: [] as SearchResultItem[] };
      }
    }),
  );
  const bestById = new Map<string, { r: SearchResultItem; s: number }>();
  for (const { c, list } of searched) {
    for (const r of list.slice(0, 5)) {
      const s = score(c, r);
      if (s < 0) continue;
      const key = `${r.mediaType}-${r.id}`;
      const cur = bestById.get(key);
      if (!cur || s > cur.s) bestById.set(key, { r, s });
    }
  }
  return Array.from(bestById.values())
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.r);
}

/** Single best match (for Siri / share-sheet auto-add). */
export async function resolveTitleFromText(text: string): Promise<SearchResultItem | null> {
  const list = await resolveCandidatesFromText(text, 1);
  return list[0] ?? null;
}
