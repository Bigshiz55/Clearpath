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

/* ------------------------------------------------------------------ *
 * PROJECT IDENTITY — is this the database the application actually uses?
 * ------------------------------------------------------------------ */

/**
 * THE HOLE THIS CLOSES. `validateDbUrl` checks that a connection string is
 * well-FORMED. It has never checked that it points at the RIGHT database, and
 * nothing else did either — no code anywhere compared `SUPABASE_DB_URL` against
 * `NEXT_PUBLIC_SUPABASE_URL`. So any syntactically valid Postgres URI was
 * accepted and migrated, including one belonging to a different Supabase
 * project entirely.
 *
 * That failure is silent and expensive in both directions: migrations land on a
 * database the app never reads (so the schema drift persists and looks like the
 * migration "did nothing"), while a database the app DOES read gets altered by
 * a deployment that was not aiming at it. A stale value left over from another
 * project — precisely the kind of thing that accumulates in a Vercel env list —
 * is enough to cause it.
 *
 * A PROJECT REF IS NOT A SECRET. It is the subdomain of
 * `NEXT_PUBLIC_SUPABASE_URL`, which ships to every browser. Naming both refs in
 * the refusal is therefore safe and is the whole point: "these do not match" is
 * unactionable without saying which two.
 */

/** Supabase project ref: the first label of `https://<ref>.supabase.co`. */
export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.in')) return null;
    const ref = host.split('.')[0];
    return ref && ref !== 'db' ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Supabase project ref from a Postgres connection string.
 *
 * TWO FORMS, AND THE REF LIVES IN A DIFFERENT PLACE IN EACH:
 *
 *   Session/transaction pooler  the host is shared infrastructure
 *     (`aws-0-<region>.pooler.supabase.com`) and carries no ref at all — the
 *     ref is in the USERNAME, as `postgres.<ref>`. Reading the host here would
 *     find nothing and wrongly report "cannot determine".
 *
 *   Direct                      `db.<ref>.supabase.co`, ref in the host.
 *
 * Returns null when neither form is recognised, which the caller treats as a
 * refusal rather than a pass — see `assertSameProject`.
 */
export function projectRefFromDbUrl(dbUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(dbUrl.trim());
  } catch {
    return null;
  }

  // Pooler: postgres.<ref>
  const user = decodeURIComponent(u.username || '');
  const dot = user.indexOf('.');
  if (dot > 0) {
    const ref = user.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{16,}$/.test(ref)) return ref;
  }

  // Direct: db.<ref>.supabase.co
  const host = u.hostname.toLowerCase();
  const m = /^db\.([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  if (m) return m[1]!;

  return null;
}

export type ProjectMatch =
  | { ok: true; ref: string }
  | { ok: false; code: 'project_ref_mismatch' | 'project_ref_indeterminate'; reason: string };

/**
 * Refuse unless the migration target is provably the application's own project.
 *
 * FAILS CLOSED ON "CANNOT TELL", not just on "does not match". An unrecognised
 * URL shape means the guard cannot do its job, and a guard that waves through
 * everything it does not understand is not a guard — it is a comment. The
 * refusal names the form to use rather than offering a bypass flag, because a
 * bypass is how this kind of check rots into always-on.
 *
 * Never receives, reads or emits the password: it extracts two refs and
 * compares them.
 */
export function assertSameProject(supabaseUrl: string | undefined, dbUrl: string): ProjectMatch {
  const appRef = supabaseUrl ? projectRefFromSupabaseUrl(supabaseUrl) : null;
  if (!appRef) {
    return {
      ok: false,
      code: 'project_ref_indeterminate',
      reason:
        'Could not read a Supabase project ref from NEXT_PUBLIC_SUPABASE_URL, so the migration ' +
        'target cannot be confirmed to be this application’s database. Expected the form ' +
        'https://<project-ref>.supabase.co.',
    };
  }

  const dbRef = projectRefFromDbUrl(dbUrl);
  if (!dbRef) {
    return {
      ok: false,
      code: 'project_ref_indeterminate',
      reason:
        'Could not read a Supabase project ref from the configured database URL, so it cannot be ' +
        'confirmed to be this application’s database. Use the Session pooler URI ' +
        '(username postgres.<project-ref>) or the direct URI (host db.<project-ref>.supabase.co).',
    };
  }

  if (appRef !== dbRef) {
    return {
      ok: false,
      code: 'project_ref_mismatch',
      reason:
        `The configured migration database belongs to Supabase project "${dbRef}", but this ` +
        `application reads project "${appRef}". Refusing to connect — migrating the wrong database ` +
        'is not recoverable by re-running anything.',
    };
  }

  return { ok: true, ref: appRef };
}
