// ISBN-10 / ISBN-13 validation, normalization, and conversion. Pure and tested.
// Used for edition identity and import deduplication — a book's identifiers are
// the strongest signal that two records are the same edition.

/** Strip hyphens/spaces and uppercase the check digit. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn10(raw: string): boolean {
  const s = normalizeIsbn(raw);
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i]!;
    const val = ch === 'X' ? 10 : Number(ch);
    sum += val * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(raw: string): boolean {
  const s = normalizeIsbn(raw);
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw);
  return s.length === 10 ? isValidIsbn10(s) : s.length === 13 ? isValidIsbn13(s) : false;
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? 'X' : String(check);
}

/** Convert a valid ISBN-10 to ISBN-13, or null if input is invalid. */
export function isbn10To13(raw: string): string | null {
  const s = normalizeIsbn(raw);
  if (!isValidIsbn10(s)) return null;
  const core = '978' + s.slice(0, 9);
  return core + isbn13CheckDigit(core);
}

/** Convert a 978-prefixed ISBN-13 to ISBN-10, or null if not convertible. */
export function isbn13To10(raw: string): string | null {
  const s = normalizeIsbn(raw);
  if (!isValidIsbn13(s) || !s.startsWith('978')) return null;
  const core = s.slice(3, 12);
  return core + isbn10CheckDigit(core);
}

/**
 * Canonical ISBN-13 form for any valid ISBN (10 or 13), used as the edition
 * identity key. Returns null when the input is not a valid ISBN.
 */
export function toCanonicalIsbn13(raw: string): string | null {
  const s = normalizeIsbn(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) return isbn10To13(s);
  return null;
}
