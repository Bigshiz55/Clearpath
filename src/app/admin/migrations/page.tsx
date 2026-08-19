import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import type { Metadata } from 'next';
import { ApplyMigrationsButton } from '@/components/admin/ApplyMigrationsButton';
import { ReconcileDryRunButton } from '@/components/admin/ReconcileDryRunButton';

export const metadata: Metadata = {
  title: 'Migrations · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

/**
 * SESSION-GATED, AND IT COLLECTS NOTHING.
 *
 * This page previously asked for the production database Host, Port, User,
 * Database and Password, a full connection string, and MIGRATE_SECRET. Those
 * fields are gone. A browser page is not a place to type production
 * credentials, and this one must never ask for them again — see the header of
 * ApplyMigrationsButton for the full reasoning.
 *
 * What remains: two server-authorized actions (a read-only schema check and a
 * migration run), both authorized by the signed-in admin session against
 * ADMIN_EMAILS, both connecting from the deployment's own server-side
 * configuration. When that configuration is missing, the routes say so plainly
 * instead of offering a field to work around it.
 *
 * Restored (route + this page + the button) after `feat(build): run
 * migrations automatically on deploy` removed them in favor of an
 * automatic `npm run migrate && next build` step, which was itself
 * reverted five broken deploys later (`revert(build): remove migration
 * step from build pipeline`) and never replaced — leaving every migration
 * registered after that point with no way to reach production at all. That
 * gap is the root cause of the schema drift documented in
 * docs/SCHEMA_DRIFT_0042.md.
 */
export default async function AdminMigrationsPage() {
  /* THE SAME GATE THE OTHER ADMIN PAGES USE. This page had none: no
     /admin/layout.tsx exists, middleware carries no /admin rule, and the page
     itself checked nothing, so the admin tooling rendered for anyone who knew
     the URL. The APIs behind it were already protected — `isAdminEmail` on
     config-state and reconcile-dry, `MIGRATE_SECRET` on migrate — so this was
     exposure of internal tooling rather than privilege escalation, and it is
     still not something a stranger should be able to look at.
     `notFound()` rather than a 403, matching the other admin pages: a stranger
     does not learn the route exists. */
  const { data: { user } } = await createClient().auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) notFound();
  return (
    <div className="min-h-dvh">
      <main className="container-page max-w-2xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-black text-white">Migrations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sign in with your admin email to check the live schema or apply pending migrations. This page never asks
            for a database password, connection string, or migration secret.
          </p>
        </div>

        <ReconcileDryRunButton />

        <ApplyMigrationsButton />
      </main>
    </div>
  );
}
