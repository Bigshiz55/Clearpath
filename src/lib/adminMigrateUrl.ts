/**
 * SANITIZING AND VALIDATING A POSTGRES CONNECTION STRING for the admin
 * migrate route — pure, so the exact "why is this rejected" logic is
 * unit-testable without a real Postgres connection.
 *
 * This exists because `new URL(...)` (which `pg` calls internally on a
 * connection string) throws a bare "Invalid URL" with no detail about WHICH
 * part is wrong — the failure mode that made the migrate route unusable in
 * practice: a copy-pasted value with wrapping quotes or a trailing newline
 * (both extremely common when pasting into Vercel's env var editor, or into
 * this page's own field) fails with the exact same unhelpful message as a
 * genuinely wrong connection string, and there was no way to tell them
 * apart. Sanitizing the common artifacts first, then validating what's left
 * with a SPECIFIC reason, turns that dead end into an actionable message.
 */

/** Strip whitespace and a single layer of wrapping quotes/brackets — the
 *  artifacts of pasting `SUPABASE_DB_URL="postgres://..."` (quotes typed on
 *  purpose but not meant to be part of the value) or `<postgres://...>`
 *  (copied including template placeholders) into an env var box. */
export function sanitizeDbUrl(raw: string): string {
  let s = raw.trim();
  const wraps: [string, string][] = [['"', '"'], ["'", "'"], ['<', '>'], ['`', '`']];
  for (const [open, close] of wraps) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

export interface DbUrlValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate a (already-sanitized) connection string, with a reason specific
 * enough to act on. Never echoes any part of the input back — the reasons
 * describe a structural property ("has 2 @ characters") the caller can
 * check against their own copy, not a substring of the secret itself.
 */
export function validateDbUrl(s: string): DbUrlValidation {
  if (!s) return { ok: false, reason: 'Empty after trimming whitespace.' };
  if (!/^postgres(ql)?:\/\//.test(s)) {
    return {
      ok: false,
      reason: 'Must start with postgres:// or postgresql:// — check for a stray prefix, or that the whole '
        + 'connection string (not just the host) was pasted.',
    };
  }
  // A valid postgres URL has exactly one unencoded "@" separating userinfo
  // from host. Two or more is the single most common real failure here: a
  // database password containing an unescaped @, #, or % character, which
  // Supabase's own dashboard does not warn about when it generates one.
  const atCount = (s.match(/@/g) ?? []).length;
  if (atCount > 1) {
    return {
      ok: false,
      reason: `Contains ${atCount} "@" characters — a connection string has exactly one, separating the `
        + 'password from the host. This usually means the database password itself contains an unescaped '
        + '@ (or another reserved character like : / ? # %) that needs percent-encoding. In the Supabase '
        + 'dashboard, resetting the database password lets you choose one without reserved characters, '
        + 'which sidesteps this entirely.',
    };
  }
  try {
    const u = new URL(s);
    if (!u.hostname) return { ok: false, reason: 'Parsed, but has no host.' };
  } catch {
    return {
      ok: false,
      reason: 'Does not parse as a URL even after removing wrapping quotes/whitespace and confirming the '
        + 'scheme and @ count look right. Re-copy it fresh from Supabase → Settings → Database → '
        + 'Connection string → URI.',
    };
  }
  return { ok: true };
}
