// Pure display/derivation helpers. No I/O; safe to import anywhere.

/** Average words per book page (industry rule of thumb). */
export const WORDS_PER_PAGE = 275;
/** Average adult reading speed, words per minute. */
export const WORDS_PER_MINUTE = 250;

/** Estimated reading time in minutes for a page count, or null if unknown. */
export function readingMinutes(pageCount: number | null): number | null {
  if (pageCount == null || pageCount <= 0) return null;
  return Math.round((pageCount * WORDS_PER_PAGE) / WORDS_PER_MINUTE);
}

/** Human-friendly reading time, e.g. "≈ 6h 20m" or "≈ 45m". */
export function readingTimeLabel(pageCount: number | null): string | null {
  const mins = readingMinutes(pageCount);
  if (mins == null) return null;
  if (mins < 60) return `≈ ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `≈ ${h}h` : `≈ ${h}h ${m}m`;
}

/** Human-friendly audiobook duration from minutes, e.g. "8h 12m". */
export function durationLabel(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
