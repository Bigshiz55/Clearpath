// Runtime env access — read lazily, never at import/build time, so `next build`
// works without any configuration (ReadVerdict needs no secrets to run).

/** Optional contact string for the outbound Open Library User-Agent. */
export function openLibraryContact(): string {
  return process.env.OPENLIBRARY_CONTACT?.trim() || 'anonymous';
}

/** Public site URL, used for absolute links/metadata. Falls back to localhost. */
export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
}
