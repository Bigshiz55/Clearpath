// Pure display/derivation helpers. No I/O, safe to import anywhere.

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

export type LengthBand = 'short' | 'standard' | 'long' | 'epic' | 'unknown';

/** Coarse length band from page count. */
export function lengthBand(pageCount: number | null): LengthBand {
  if (pageCount == null || pageCount <= 0) return 'unknown';
  if (pageCount <= 250) return 'short';
  if (pageCount <= 450) return 'standard';
  if (pageCount <= 700) return 'long';
  return 'epic';
}

export function lengthLabel(band: LengthBand): string {
  switch (band) {
    case 'short':
      return 'Quick read';
    case 'standard':
      return 'Standard length';
    case 'long':
      return 'Long';
    case 'epic':
      return 'Epic';
    case 'unknown':
    default:
      return 'Length unknown';
  }
}

export type EraBand = 'contemporary' | 'modern' | 'classic' | 'antiquarian' | 'unknown';

/** Era band from first publication year, relative to a reference year. */
export function eraBand(year: number | null, refYear: number): EraBand {
  if (year == null || year <= 0) return 'unknown';
  const age = refYear - year;
  if (age <= 8) return 'contemporary';
  if (age <= 40) return 'modern';
  if (age <= 120) return 'classic';
  return 'antiquarian';
}

export function eraLabel(band: EraBand): string {
  switch (band) {
    case 'contemporary':
      return 'Contemporary';
    case 'modern':
      return 'Modern';
    case 'classic':
      return 'Classic';
    case 'antiquarian':
      return 'Antiquarian';
    case 'unknown':
    default:
      return 'Publication date unknown';
  }
}

/** Title-case a raw Open Library subject slug/label for display. */
export function tidySubject(subject: string): string {
  return subject
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
