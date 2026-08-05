import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor, getAvatar } from '@/lib/profile';
import { isPro } from '@/lib/pro';
import { Nav } from '@/components/Nav';
import { DocketTray } from '@/components/DocketTray';
import { QuickSearch } from '@/components/QuickSearch';
import { PublicHeader, PublicFooter } from '@/components/discovery/DiscoveryLayout';

/**
 * THE PACK SHELL — the app for signed-in people, the public site for everyone
 * else.
 *
 * ── THE DEFECT THIS FIXES ─────────────────────────────────────────────────
 * /packs and /packs/[slug] live OUTSIDE the /app route group, so they never
 * got `AppLayout`. Every visitor — signed in or not — was served
 * `PublicHeader`, whose right-hand action is a hard-coded "Sign in" link.
 * A signed-in user opening a Pack therefore:
 *
 *   - was invited to sign in to an account they were already using;
 *   - lost the header search, their avatar and account menu;
 *   - lost the bottom navigation, so on a phone the Pack was a dead end
 *     with no way back into the app except the browser's Back button;
 *   - lost the docket tray, so anything they had queued disappeared.
 *
 * Packs are a logged-in feature wearing a logged-out costume. This component
 * resolves the real user once, on the server, and renders the same chrome
 * `AppLayout` does — `Nav` (which carries search, avatar and the bottom bar),
 * `DocketTray` and `QuickSearch`.
 *
 * ── WHY NOT REDIRECT ANONYMOUS VISITORS ───────────────────────────────────
 * Packs are also a public marketing surface: an anonymous visitor should be
 * able to read a Pack and decide to join. They keep the public header. What
 * must never happen is the reverse — showing "Sign in" to someone who is.
 *
 * Auth failure is treated as anonymous, never as an error: a Pack page is
 * content, and a flaky auth call must not turn it into a 500.
 */
export async function PackChrome({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  let personalLabel: string | null = null;
  let isGuest = false;
  let pro = false;
  let avatarLabel = '🍿';
  let email: string | null = null;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      isGuest = user.is_anonymous === true;
      const profile = await getProfile(supabase, user.id).catch(() => null);
      personalLabel = profile ? personalLabelFor(profile) : null;
      if (!isGuest) {
        pro = await isPro(supabase, user.id).catch(() => false);
        const avatar = await getAvatar(supabase, user.id).catch(() => null);
        avatarLabel = avatar ?? (user.email?.[0] ?? '🍿').toUpperCase();
        email = user.email ?? null;
      }
    }
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    return (
      <>
        <PublicHeader />
        {children}
        <PublicFooter />
      </>
    );
  }

  // Same shell as AppLayout, including the pb-24 that keeps content clear of
  // the phone bottom bar.
  return (
    <div className="min-h-dvh pb-24 lg:pb-0" data-testid="pack-app-shell">
      <Nav
        personalLabel={personalLabel}
        isGuest={isGuest}
        pro={pro}
        avatarLabel={avatarLabel}
        email={email}
      />
      {children}
      <DocketTray />
      <QuickSearch />
    </div>
  );
}
