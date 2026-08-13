import 'server-only';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

/**
 * THE ONE GATE ON /admin. EVERY PAGE UNDER IT, BY DEFAULT.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The check used to be hand-rolled per page: three lines of `getUser()` +
 * `isAdminEmail()` + `notFound()`, copied into each admin screen. That is a
 * gate you have to REMEMBER, and the record shows what remembering is worth —
 * two of the five admin pages shipped without it:
 *
 *   /admin/migrations — its own doc comment says "SESSION-GATED, and it
 *                       collects nothing". The first half was not true. The
 *                       destructive actions behind it are authorized
 *                       server-side on their own (`/api/admin/migrate` and
 *                       `/api/admin/reconcile-*` return 401/403), so nothing
 *                       ran for a stranger — but the page rendered for one.
 *   /admin/tv         — the coverage dashboard: data mode, egress counts,
 *                       which sources are blocked and on what. Operational
 *                       detail about the deployment, readable by anybody who
 *                       guessed the path.
 *
 * A layout runs for every nested route whether or not its author thought about
 * auth, so the next `/admin/*` page is gated the moment it exists. That is the
 * whole point: the safe thing has to be the default thing.
 *
 * ── NOT FOUND, NOT FORBIDDEN ──────────────────────────────────────────────
 * `notFound()` rather than a redirect or a 403, matching what the gated pages
 * already did: a 403 confirms the route is real. A non-admin should not learn
 * that /admin/watchmode exists.
 *
 * ── WHAT THIS DOES NOT REPLACE ────────────────────────────────────────────
 * Every `/api/admin/*` route still authorizes itself. A page gate is not an
 * API gate — the endpoints are reachable directly, and `adminSurfaces.test.ts`
 * pins that they each still check.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // `getUser()`, never `getSession()` — the session cookie is client-readable
  // and unverified; this asks the auth server who the bearer actually is.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();
  return <>{children}</>;
}
