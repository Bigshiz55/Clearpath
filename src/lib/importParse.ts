// Client-safe parsing for history import. Handles Netflix "viewing activity"
// CSV exports (Title,Date with episode-level rows) and free-form pasted lists
// like "Prisoners - 9". No server-only or secret imports — safe on the client.

export interface ParsedTitle {
  title: string;
  rating: number | null;
}

// Netflix encodes episodes as "Show: Season 1: Episode 3",
// "Show: Limited Series: Episode 5", "Show: Part 2: …", etc. Strip that
// structure back to the base show title. Titles with a colon but no episode
// marker (e.g. "Mission: Impossible") are left intact.
const TV_SUFFIX =
  /:\s*(Season\s+\d+|Limited Series|Miniseries|Part\s+\d+|Vol(?:ume)?\s+\d+|Chapter\s+\d+|Book\s+\d+|Series\s+\d+|Episode\s+\d+|Collection).*$/i;

export function stripEpisode(title: string): string {
  return title.replace(TV_SUFFIX, '').trim();
}

function isHeader(raw: string): boolean {
  return /^\s*"?title"?\s*,\s*"?date"?\s*"?$/i.test(raw) || raw.trim().toLowerCase() === 'title';
}

function parseOneLine(raw: string, netflix: boolean): ParsedTitle | null {
  if (isHeader(raw)) return null;
  let s = raw.trim();
  if (!s) return null;

  // Netflix CSV row: "Title","Date" → take the first quoted field.
  const csv = s.match(/^"([^"]*)"\s*,/);
  if (csv) s = csv[1]!;
  else s = s.replace(/^"|"$/g, '');

  // Leading bullets / numbering from pasted lists.
  s = s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '');

  // Only pull a trailing rating for free-form lists — Netflix rows have none,
  // and guessing there would mangle titles like "Ocean's 8".
  let rating: number | null = null;
  if (!netflix) {
    const rm = s.match(/[\s\-–—:|,=]\s*(\d{1,2}(?:\.\d)?)(?:\s*\/\s*10)?\s*$/);
    if (rm) {
      const n = Math.round(Number.parseFloat(rm[1]!));
      if (n >= 1 && n <= 10) {
        rating = n;
        s = s.slice(0, rm.index).trim();
      }
    }
  }

  s = stripEpisode(s).replace(/[\s\-–—:|,]+$/, '').trim();
  if (!s) return null;
  return { title: s, rating };
}

/**
 * Parse pasted text or a Netflix CSV into a deduped list of titles. Detects
 * Netflix format (a Title,Date header or many quoted "a","b" rows) so episode
 * rows collapse to one entry per show and no bogus ratings are inferred.
 */
export function parseImportText(text: string): ParsedTitle[] {
  const lines = text.split(/\r?\n/);
  const firstReal = lines.find((l) => l.trim().length > 0) ?? '';
  const quotedRows = lines.filter((l) => /^\s*"[^"]*"\s*,\s*"[^"]*"/.test(l)).length;
  const netflix = isHeader(firstReal) || quotedRows >= 3;

  const out: ParsedTitle[] = [];
  const seen = new Map<string, number>();
  for (const line of lines) {
    const p = parseOneLine(line, netflix);
    if (!p) continue;
    const key = p.title.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(p);
    } else if (p.rating != null && out[at]!.rating == null) {
      out[at]!.rating = p.rating;
    }
  }
  return out;
}
