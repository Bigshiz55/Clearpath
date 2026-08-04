import type { Metadata } from 'next';
import { ApplyMigrationsButton } from '@/components/admin/ApplyMigrationsButton';
import { ReconcileDryRunButton } from '@/components/admin/ReconcileDryRunButton';

export const metadata: Metadata = {
  title: 'Migrations · WatchVerd1ct admin',
  robots: { index: false, follow: false },
};

/**
 * TOKEN-GATED, NOT SESSION-GATED. The app is anonymous-first — there is no
 * email sign-in, so the ADMIN_EMAILS/session check this page used to run
 * could never match a real visitor and always 404'd. Authorization now
 * happens the same way it already did for curl: the MIGRATE_SECRET bearer
 * token, checked server-side by the untouched /api/admin/migrate route.
 *
 * This page itself is a static shell with no server data fetch and no
 * Supabase call — nothing sensitive to expose before a token is entered.
 * The migration list/status is revealed only via that route's own response,
 * inside ApplyMigrationsButton, after a correct token is submitted.
 *
 * Restored (route + this page + the button) after `feat(build): run
 * migrations automatically on deploy` removed them in favor of an
 * automatic `npm run migrate && next build` step, which was itself
 * reverted five broken deploys later (`revert(build): remove migration
 * step from build pipeline`) and never replaced — leaving every migration
 * registered after that point (0038 onward) with no way to reach
 * production at all. This manual route never touched the build command in
 * the first place, so it isn't implicated in that failure.
 */
export default function AdminMigrationsPage() {
  return (
    <div className="min-h-dvh">
      <main className="container-page max-w-2xl space-y-6 py-8">
        <div>
          <h1 className="text-2xl font-black text-white">Migrations</h1>
          <p className="mt-1 text-sm text-slate-400">Enter the migrate secret to apply pending database migrations.</p>
        </div>

        <ReconcileDryRunButton />

        <ApplyMigrationsButton />
      </main>
    </div>
  );
}
