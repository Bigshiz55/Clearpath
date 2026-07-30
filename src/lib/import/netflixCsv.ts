/**
 * NETFLIX VIEWING-HISTORY CSV PARSER.
 *
 * Pure, no I/O. Netflix's export is not a stable contract: column order moves,
 * headers are localised, titles contain commas and quotes, and the same file
 * mixes films, series episodes and specials in one flat "Title" column. So this
 * detects columns by meaning rather than position, and NEVER silently drops a
 * row — everything unparsable is returned with a reason so the review screen
 * can show it.
 *
 * We ask the user to download and upload the file themselves. There is no
 * Netflix login, cookie, or scraping anywhere in this feature.
 */

export type RowStatus = 'ok' | 'duplicate' | 'invalid' | 'blank';

export interface ParsedRow {
  /** Exactly what the file said, kept for the review screen. */
  rawTitle: string;
  rawDate: string | null;
  /** Series title when the row is an episode, else null. */
  seriesTitle: string | null;
  seasonLabel: string | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** ISO date, or null when the file's date was unusable. */
  watchedOn: string | null;
  profileName: string | null;
  isEpisode: boolean;
  status: RowStatus;
  /** Why a row is not `ok`. Shown to the user, never swallowed. */
  reason?: string;
  lineNumber: number;
}

export interface ParseReport {
  rows: ParsedRow[];
  detected: number;
  accepted: number;
  duplicates: number;
  invalid: number;
  blank: number;
  profiles: string[];
  dateRange: { first: string; last: string } | null;
  /** Header labels we recognised, and what we mapped them to. */
  columnMap: Record<string, string>;
  /** Headers present in the file we did not understand. */
  unknownColumns: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// CSV tokenising — RFC4180-ish, tolerant of the things real exports contain
// ---------------------------------------------------------------------------

/** Split one CSV line, honouring quotes and doubled escapes. */
export function splitCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }   // escaped quote
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Guess the delimiter — some locales export semicolon-separated files. */
export function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => ({ d, n: splitCsvLine(headerLine, d).length }));
  return counts.sort((a, b) => b.n - a.n)[0]!.d;
}

// ---------------------------------------------------------------------------
// Column detection, by meaning
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: { field: string; match: RegExp }[] = [
  { field: 'title', match: /^(title|titre|título|titel|titolo|名前|제목)$/i },
  { field: 'date', match: /^(date|datum|fecha|data|дата|日付|날짜|date ?watched|watch ?date)$/i },
  { field: 'profile', match: /^(profile|profile ?name|perfil|profil|profilo)$/i },
  { field: 'country', match: /^(country|país|land|pays|paese)$/i },
  { field: 'device', match: /^(device|device ?type|dispositivo|gerät)$/i },
  { field: 'duration', match: /^(duration|bookmark|playback ?duration|dauer|duración)$/i },
  { field: 'rating', match: /^(rating|thumbs|thumbs ?value|star ?value|valoración)$/i },
];

export function mapColumns(headers: string[]): { map: Record<string, number>; unknown: string[]; labels: Record<string, string> } {
  const map: Record<string, number> = {};
  const labels: Record<string, string> = {};
  const unknown: string[] = [];
  headers.forEach((h, i) => {
    const clean = h.replace(/^﻿/, '').trim();
    const hit = COLUMN_ALIASES.find((a) => a.match.test(clean));
    if (hit && map[hit.field] === undefined) {
      map[hit.field] = i;
      labels[clean] = hit.field;
    } else if (clean) {
      unknown.push(clean);
    }
  });
  return { map, unknown, labels };
}

/** Does this look like a header row, or did the export omit headers? */
export function looksLikeHeader(cells: string[]): boolean {
  return cells.some((c) => COLUMN_ALIASES.some((a) => a.match.test(c.replace(/^﻿/, '').trim())));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Parse a Netflix date. The export is localised, so `3/4/2026` is genuinely
 * ambiguous — we resolve it using the rest of the file (see `inferDateOrder`)
 * rather than assuming US order and silently shifting months.
 */
export function parseDate(raw: string, order: 'mdy' | 'dmy' | 'ymd'): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (slash) {
    const a = Number(slash[1]), b = Number(slash[2]);
    y = Number(slash[3]);
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (order === 'dmy') { d = a; m = b; } else { m = a; d = b; }
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. Feb 30
  return dt.toISOString().slice(0, 10);
}

/**
 * Work out whether the file is month-first or day-first by looking for a value
 * that can only be one of them (a first component above 12).
 */
export function inferDateOrder(samples: string[]): 'mdy' | 'dmy' | 'ymd' {
  let dayFirst = 0, monthFirst = 0;
  for (const s of samples) {
    if (/^\d{4}-/.test(s.trim())) return 'ymd';
    const m = s.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.]/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirst++;
    if (b > 12 && a <= 12) monthFirst++;
  }
  if (dayFirst > monthFirst) return 'dmy';
  return 'mdy'; // Netflix's US default when the file gives no evidence
}

// ---------------------------------------------------------------------------
// Title decomposition
// ---------------------------------------------------------------------------

const SEASON_PATTERNS: RegExp[] = [
  /^(?:season|series|temporada|staffel|saison|stagione)\s*(\d+)/i,
  /^(?:limited series|miniseries)$/i,
  /^(?:part|volume|vol\.?|book|chapter)\s*(\d+)/i,
  /^(?:collection|series)\s*(\d+)/i,
];

const EPISODE_NUM = /(?:episode|ep\.?|folge|episodio|épisode)\s*(\d+)/i;

/**
 * Netflix writes episodes as `Series: Season 2: Episode Title`, with locale and
 * show-specific variations. Split on the colon hierarchy and identify which
 * middle segment is a season label.
 */
export function decomposeTitle(raw: string): {
  seriesTitle: string | null;
  seasonLabel: string | null;
  episodeTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isEpisode: boolean;
} {
  const none = {
    seriesTitle: null, seasonLabel: null, episodeTitle: null,
    seasonNumber: null, episodeNumber: null, isEpisode: false,
  };
  const parts = raw.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return none;

  // Find a segment that reads as a season/part label.
  let seasonIdx = -1;
  let seasonNumber: number | null = null;
  for (let i = 1; i < parts.length; i++) {
    for (const p of SEASON_PATTERNS) {
      const m = parts[i]!.match(p);
      if (m) {
        seasonIdx = i;
        seasonNumber = m[1] ? Number(m[1]) : null;
        break;
      }
    }
    if (seasonIdx >= 0) break;
  }

  // `Show: Episode Title` with no season label is still an episode row.
  if (seasonIdx === -1) {
    return {
      seriesTitle: parts[0]!,
      seasonLabel: null,
      episodeTitle: parts.slice(1).join(': '),
      seasonNumber: null,
      episodeNumber: null,
      isEpisode: true,
    };
  }

  const episodeTitle = parts.slice(seasonIdx + 1).join(': ') || null;
  const epMatch = episodeTitle?.match(EPISODE_NUM);
  return {
    seriesTitle: parts.slice(0, seasonIdx).join(': '),
    seasonLabel: parts[seasonIdx]!,
    episodeTitle,
    seasonNumber,
    episodeNumber: epMatch ? Number(epMatch[1]) : null,
    isEpisode: true,
  };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

export const MAX_ROWS = 100_000;

export function parseNetflixCsv(text: string): ParseReport {
  const warnings: string[] = [];
  // Strip a BOM; some exports are UTF-8 with one, which otherwise corrupts the
  // first header and loses the Title column entirely.
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n');

  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) {
    return {
      rows: [], detected: 0, accepted: 0, duplicates: 0, invalid: 0, blank: 0,
      profiles: [], dateRange: null, columnMap: {}, unknownColumns: [],
      warnings: ['The file is empty.'],
    };
  }

  const delimiter = detectDelimiter(lines[firstNonEmpty]!);
  const headerCells = splitCsvLine(lines[firstNonEmpty]!, delimiter);
  const hasHeader = looksLikeHeader(headerCells);

  let map: Record<string, number>;
  let unknown: string[] = [];
  let labels: Record<string, string> = {};
  let bodyStart: number;

  if (hasHeader) {
    const m = mapColumns(headerCells);
    map = m.map; unknown = m.unknown; labels = m.labels;
    bodyStart = firstNonEmpty + 1;
  } else {
    // No recognisable header. Netflix's own export is Title,Date, so assume
    // that shape — but only after checking the second column really does look
    // like dates. Without that check a file whose header row we simply did not
    // recognise would import its own header as a watched title.
    const probe = lines.slice(firstNonEmpty, firstNonEmpty + 12)
      .filter((l) => l.trim())
      .map((l) => splitCsvLine(l, delimiter)[1] ?? '');
    const datey = probe.filter((v) => parseDate(v, inferDateOrder(probe)) != null).length;

    if (probe.length > 0 && datey === 0) {
      return {
        rows: [], detected: 0, accepted: 0, duplicates: 0, invalid: 0, blank: 0,
        profiles: [], dateRange: null, columnMap: {},
        unknownColumns: headerCells.filter(Boolean),
        warnings: [
          'This file does not look like a Netflix viewing history: no title column was recognised, ' +
          'and the second column does not contain dates. Nothing was imported.',
        ],
      };
    }
    map = { title: 0, date: 1 };
    bodyStart = firstNonEmpty;
    warnings.push('No column headers were found; assuming the first column is the title and the second is the date.');
  }

  if (map.title === undefined) {
    return {
      rows: [], detected: 0, accepted: 0, duplicates: 0, invalid: 0, blank: 0,
      profiles: [], dateRange: null, columnMap: labels, unknownColumns: unknown,
      warnings: [...warnings, 'No title column could be identified, so nothing could be imported from this file.'],
    };
  }

  const body = lines.slice(bodyStart);
  if (body.length > MAX_ROWS) {
    warnings.push(`The file has ${body.length.toLocaleString()} rows; only the first ${MAX_ROWS.toLocaleString()} were read.`);
  }

  // Infer date order across the whole file before parsing any single row.
  const dateIdx = map.date;
  const dateSamples = dateIdx === undefined ? [] : body.slice(0, 500)
    .map((l) => splitCsvLine(l, delimiter)[dateIdx] ?? '')
    .filter(Boolean);
  const order = inferDateOrder(dateSamples);

  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  const profiles = new Set<string>();
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  body.slice(0, MAX_ROWS).forEach((line, i) => {
    const lineNumber = bodyStart + i + 1;
    if (!line.trim()) {
      rows.push({
        rawTitle: '', rawDate: null, seriesTitle: null, seasonLabel: null,
        episodeTitle: null, seasonNumber: null, episodeNumber: null,
        watchedOn: null, profileName: null, isEpisode: false,
        status: 'blank', lineNumber,
      });
      return;
    }

    const cells = splitCsvLine(line, delimiter);

    // A row with MORE values than the file has columns almost always means an
    // unescaped comma inside the title. Indexing blindly would shift every
    // later column — we saw a date imported as a profile name that way. Flag
    // it instead of importing something we know is misaligned.
    if (hasHeader && cells.length > headerCells.length) {
      rows.push({
        rawTitle: cells.slice(0, cells.length - headerCells.length + 1).join(delimiter).trim(),
        rawDate: null, seriesTitle: null, seasonLabel: null, episodeTitle: null,
        seasonNumber: null, episodeNumber: null, watchedOn: null, profileName: null,
        isEpisode: false, status: 'invalid', lineNumber,
        reason: `This row has ${cells.length} values but the file has ${headerCells.length} columns — the title probably contains a comma that was not quoted.`,
      });
      return;
    }

    const rawTitle = (cells[map.title!] ?? '').trim();
    const rawDate = dateIdx === undefined ? null : (cells[dateIdx] ?? '').trim() || null;
    const profileName = map.profile === undefined ? null : (cells[map.profile] ?? '').trim() || null;
    if (profileName) profiles.add(profileName);

    const base = {
      rawTitle, rawDate, profileName, lineNumber,
      ...decomposeTitle(rawTitle),
      watchedOn: rawDate ? parseDate(rawDate, order) : null,
    };

    if (!rawTitle) {
      rows.push({ ...base, status: 'invalid', reason: 'This row has no title.' });
      return;
    }
    if (rawDate && !base.watchedOn) {
      // Keep the title — a date we cannot read is not a reason to lose the row.
      rows.push({ ...base, status: 'ok', reason: `The date "${rawDate}" could not be read, so this title has no watch date.` });
    } else {
      const key = `${rawTitle.toLowerCase()}|${base.watchedOn ?? ''}|${profileName ?? ''}`;
      if (seen.has(key)) {
        rows.push({ ...base, status: 'duplicate', reason: 'An identical row appears earlier in the file.' });
        return;
      }
      seen.add(key);
      rows.push({ ...base, status: 'ok' });
    }

    if (base.watchedOn) {
      if (!firstDate || base.watchedOn < firstDate) firstDate = base.watchedOn;
      if (!lastDate || base.watchedOn > lastDate) lastDate = base.watchedOn;
    }
  });

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  return {
    rows,
    detected: rows.length,
    accepted: count('ok'),
    duplicates: count('duplicate'),
    invalid: count('invalid'),
    blank: count('blank'),
    profiles: [...profiles].sort(),
    dateRange: firstDate && lastDate ? { first: firstDate, last: lastDate } : null,
    columnMap: labels,
    unknownColumns: unknown,
    warnings,
  };
}
