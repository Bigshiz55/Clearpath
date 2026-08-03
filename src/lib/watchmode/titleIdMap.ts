/**
 * WATCHMODE TITLE ID MAP — parsing only. Pure, no I/O.
 *
 * Watchmode publishes a single CSV (`/datasets/title_id_map.csv`, updated
 * daily) mapping every title it tracks to its own id, IMDB id, and TMDB
 * id/type. Importing this ONCE resolves every title we care about locally —
 * the alternative, a per-title Watchmode search call to find its id, would
 * alone exhaust a 2,500/month free tier long before any availability data
 * got fetched. See `sync.ts` for the one-request fetch this feeds.
 *
 * Deliberately minimal compared to `src/lib/import/netflixCsv.ts` (a
 * different feature: an interactively-reviewed user upload with per-row
 * warnings). This is a machine-to-machine batch import — hundreds of
 * thousands of rows — so it counts what it skips rather than itemizing it,
 * and only keeps rows this app can actually use (a resolved TMDB id).
 */

export interface WatchmodeTitleMapRow {
  watchmodeId: number;
  imdbId: string | null;
  tmdbId: number;
  tmdbMediaType: 'movie' | 'tv';
}

export interface TitleIdMapParseResult {
  rows: WatchmodeTitleMapRow[];
  /** Total data rows in the file (header excluded). */
  totalRows: number;
  /** Rows dropped for lacking a usable TMDB id/type — never silently merged
   *  into `rows`, always accounted for here. */
  skipped: number;
}

/** Split one CSV line, honouring quotes and doubled escapes (RFC4180-ish). */
export function splitCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
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

interface ColumnIndexes {
  watchmodeId: number;
  imdbId: number;
  tmdbId: number;
  tmdbMediaType: number;
}

const HEADER_ALIASES: Record<keyof ColumnIndexes, RegExp> = {
  watchmodeId: /^(id|watchmode_id|watchmodeid)$/i,
  imdbId: /^imdb_id$/i,
  tmdbId: /^tmdb_id$/i,
  tmdbMediaType: /^(tmdb_type|tmdb_media_type)$/i,
};

/** Locate the four columns this app needs, by header name — never by fixed
 *  position, since Watchmode's own column order is not a contract we own. */
export function findColumns(headers: string[]): ColumnIndexes | null {
  const idx: Partial<ColumnIndexes> = {};
  headers.forEach((h, i) => {
    const clean = h.replace(/^﻿/, '').trim();
    for (const [field, re] of Object.entries(HEADER_ALIASES) as [keyof ColumnIndexes, RegExp][]) {
      if (idx[field] === undefined && re.test(clean)) idx[field] = i;
    }
  });
  if (idx.watchmodeId === undefined || idx.tmdbId === undefined || idx.tmdbMediaType === undefined) return null;
  return { watchmodeId: idx.watchmodeId, imdbId: idx.imdbId ?? -1, tmdbId: idx.tmdbId, tmdbMediaType: idx.tmdbMediaType };
}

function normalizeMediaType(raw: string): 'movie' | 'tv' | null {
  const t = raw.trim().toLowerCase();
  if (t === 'movie') return 'movie';
  // Watchmode's own vocabulary includes tv_series/tv_miniseries/tv_special
  // etc. for the `type` column, but `tmdb_type` — the column we actually
  // read — is documented as exactly 'movie' | 'tv'. Accept a plain 'tv' and
  // a defensive 'tv_series' alias in case that ever isn't true; nothing else.
  if (t === 'tv' || t === 'tv_series') return 'tv';
  return null;
}

/**
 * Parse the whole CSV into `{watchmodeId -> tmdbId/tmdbMediaType/imdbId}`
 * rows. Rows with no parseable Watchmode/TMDB id, or an unrecognised media
 * type, are counted in `skipped` and dropped — never guessed, never kept
 * with a null id that would silently break the unique-key join downstream.
 */
export function parseTitleIdMapCsv(csv: string): TitleIdMapParseResult {
  const lines = csv.split(/\r\n|\r|\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], totalRows: 0, skipped: 0 };

  const headers = splitCsvLine(lines[0]!);
  const cols = findColumns(headers);
  if (!cols) return { rows: [], totalRows: lines.length - 1, skipped: lines.length - 1 };

  const rows: WatchmodeTitleMapRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const watchmodeId = Number(cells[cols.watchmodeId]);
    const tmdbIdRaw = cells[cols.tmdbId];
    const tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : NaN;
    const tmdbMediaType = normalizeMediaType(cells[cols.tmdbMediaType] ?? '');
    const imdbId = cols.imdbId >= 0 ? (cells[cols.imdbId] || null) : null;

    if (!Number.isFinite(watchmodeId) || watchmodeId <= 0 || !Number.isFinite(tmdbId) || tmdbId <= 0 || !tmdbMediaType) {
      skipped++;
      continue;
    }
    rows.push({ watchmodeId, imdbId, tmdbId, tmdbMediaType });
  }
  return { rows, totalRows: lines.length - 1, skipped };
}
