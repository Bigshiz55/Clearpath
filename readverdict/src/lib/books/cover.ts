// Client-safe Open Library cover helpers. No secrets, no I/O — just URL
// construction, so this is safe to import into client components.

export type CoverSize = 'S' | 'M' | 'L';

/**
 * Build an Open Library cover URL from a numeric cover id, or null when there
 * is no cover. We never fabricate a placeholder image URL — the UI decides how
 * to render a missing cover.
 */
export function coverUrl(coverId: number | null, size: CoverSize = 'M'): string | null {
  if (coverId == null || coverId <= 0) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}
