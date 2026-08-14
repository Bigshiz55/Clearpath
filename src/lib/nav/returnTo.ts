/**
 * VALIDATED SAME-ORIGIN RETURN — the tour's way back to wherever you came from.
 *
 * The tour can be entered from anywhere (nav, home hint, deep in a Pack), and
 * finishing it should put you back THERE — not on a hardcoded page and not
 * wherever `history.back()` happens to point after topic-hopping. The origin
 * travels as a `returnTo` query param, and because a query param is
 * attacker-writable, nothing navigates to it until it has been through
 * `safeReturnTo`.
 *
 * THE VALIDATION IS ALLOWLIST-SHAPED: a value is either a plain same-origin
 * path (starts with exactly one `/`, parses inside a pinned dummy origin,
 * carries no protocol/host of its own) or it is replaced by the fallback.
 * `//evil.com`, `https://evil.com`, `javascript:`, backslash tricks and
 * newline smuggling all fail the same single gate. No open redirect.
 *
 * PURE and client-safe — imported by server pages and client nav alike.
 */

const FALLBACK = '/app';

export function safeReturnTo(raw: unknown, fallback: string = FALLBACK): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2000) return fallback;
  // Same-origin RELATIVE path only: one leading slash (two is
  // protocol-relative — an absolute URL in disguise).
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // Backslashes and control characters have no business in a path we wrote.
  if (raw.includes('\\')) return fallback;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }
  try {
    const u = new URL(raw, 'https://internal.invalid');
    // If parsing escaped the pinned origin, the value smuggled a host.
    if (u.origin !== 'https://internal.invalid') return fallback;
    return u.pathname + u.search;
  } catch {
    return fallback;
  }
}

/**
 * The href a nav entry should carry, given where the user currently is.
 * Only the tour gets a `returnTo` — every other destination is itself.
 * Entering the tour FROM the tour keeps it param-free (no self-loop).
 */
export function navHref(href: string, currentPathname: string | null | undefined): string {
  if (href !== '/app/tour') return href;
  const p = typeof currentPathname === 'string' ? currentPathname : '';
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/app/tour')) return href;
  return `/app/tour?returnTo=${encodeURIComponent(p)}`;
}
