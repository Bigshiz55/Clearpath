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

/** Split one CSV line into fields, honoring quotes and escaped ("") quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const findCol = (header: string[], res: RegExp[]): number => {
  for (const re of res) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

/**
 * Header-aware CSV import for the many "watch history" exports out there
 * (Letterboxd, Trakt, Simkl, TV Time CSVs, spreadsheets…). Auto-detects the
 * title, year, and rating columns, collapses TV episode rows to one per show,
 * and normalizes 5-star scales (Letterboxd) to 0–10. Returns null when the text
 * isn't a recognizable title-bearing CSV, so callers fall back to other parsers.
 */
export function parseStructuredCsv(text: string): ParsedTitle[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase().trim());
  if (header.length < 2) return null;

  const titleCol = findCol(header, [/^(name|title|series|series[_ ]?name|show|movie|movie[_ ]?name)$/, /(^|[_ ])(name|title|series|movie)($|[_ ])/]);
  if (titleCol < 0) return null;

  // Require a "richer than Netflix" signal so we don't hijack the Netflix path.
  const hasRichSignal = header.some((h) => /^(year|rating|score|series|show|movie)$/.test(h) || /letterboxd|rating|score|imdb|tmdb|tvdb/.test(h));
  if (!hasRichSignal) return null;

  const ratingCol = findCol(header, [/^(rating|score|your rating|my rating|user rating)$/, /rating|score/]);
  const isLetterboxd = header.some((h) => /letterboxd/.test(h));

  const rows = lines.slice(1).map(parseCsvLine);

  // Decide the rating scale from the data: Letterboxd (or any all-≤5 column) is
  // a 5-star scale that we double to 0–10; otherwise it's already 0–10.
  const rawRatings: number[] = [];
  if (ratingCol >= 0) {
    for (const cols of rows) {
      const n = Number.parseFloat((cols[ratingCol] ?? '').trim());
      if (Number.isFinite(n) && n > 0) rawRatings.push(n);
    }
  }
  const fiveStar = isLetterboxd || (rawRatings.length > 0 && Math.max(...rawRatings) <= 5);

  const out: ParsedTitle[] = [];
  const seen = new Map<string, number>();
  for (const cols of rows) {
    let title = (cols[titleCol] ?? '').trim().replace(/^"|"$/g, '');
    if (!title) continue;
    title = stripEpisode(title).replace(/[\s\-–—:|,]+$/, '').trim();
    if (!title) continue;

    let rating: number | null = null;
    if (ratingCol >= 0) {
      const n = Number.parseFloat((cols[ratingCol] ?? '').trim());
      if (Number.isFinite(n) && n > 0) rating = Math.max(1, Math.min(10, Math.round(fiveStar ? n * 2 : n)));
    }

    const key = title.toLowerCase();
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push({ title, rating });
    } else if (rating != null && out[at]!.rating == null) {
      out[at]!.rating = rating;
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Parse pasted text or a CSV export into a deduped list of titles. Tries a
 * header-aware CSV parse first (Letterboxd / Trakt / Simkl / TV Time / any
 * title-bearing spreadsheet), then falls back to Netflix "viewing activity"
 * detection and free-form pasted lists. Episode rows collapse to one per show.
 */
export function parseImportText(text: string): ParsedTitle[] {
  const structured = parseStructuredCsv(text);
  if (structured && structured.length > 0) return structured;

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
