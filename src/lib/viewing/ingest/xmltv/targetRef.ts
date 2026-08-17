/**
 * IMPORT TARGET IDENTITY — the fail-closed gate in front of every real
 * XMLTV import.
 *
 * The importer's reconciliation step is destructive (stale airings and
 * lineup positions are pruned after a successful pass), and the CLI takes
 * its connection from ambient env. Ambient env is exactly where the
 * preview/production accident lives: one stale shell export and an
 * acceptance import lands in the production project. So a REAL import
 * requires the operator to DECLARE the target project ref, and the declared
 * ref must match the ref parsed from `NEXT_PUBLIC_SUPABASE_URL` — otherwise
 * the CLI refuses before any connection is made.
 *
 * Only project REFS (public identifiers, printed in every Supabase dashboard
 * URL) pass through here. Keys never do.
 *
 * Pure; unit-tested in targetRef.test.ts.
 */

/** `https://<ref>.supabase.co` → `<ref>`; null for anything else — a URL this
 *  cannot name confidently is not a target, it is a refusal. */
export function supabaseProjectRef(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return m ? m[1]! : null;
}

export type ImportTargetVerdict = { ok: true; ref: string } | { ok: false; reason: string };

/** The gate itself: parseable URL + explicit declaration + exact match. */
export function verifyImportTarget(url: string | null | undefined, declaredRef: string | null | undefined): ImportTargetVerdict {
  const ref = supabaseProjectRef(url);
  if (!ref) {
    return {
      ok: false,
      reason:
        'refusing to import: NEXT_PUBLIC_SUPABASE_URL does not name a Supabase project ref (expected https://<project-ref>.supabase.co)',
    };
  }
  const declared = declaredRef?.trim() ?? '';
  if (!declared) {
    return {
      ok: false,
      reason: `refusing to import: a real import must declare its target with --project-ref <ref> (the configured URL points at project "${ref}")`,
    };
  }
  if (declared !== ref) {
    return {
      ok: false,
      reason: `refusing to import: --project-ref "${declared}" does not match the configured URL's project "${ref}" — fix the env or the flag before anything is written`,
    };
  }
  return { ok: true, ref };
}
