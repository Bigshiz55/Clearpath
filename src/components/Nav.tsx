import Link from 'next/link';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';
import { GuestSaveButton } from './GuestSaveButton';
import { MoreMenu, type NavLink } from './nav/MoreMenu';
import { MobileNav } from './nav/MobileNav';
import { ViewModeToggle } from './ViewModeToggle';
import { Avatar } from './Avatar';

// Information architecture: the six jobs are Ask · Discover · On TV · Saved ·
// Together · Profile. "Ask" leads because deciding-what-to-watch is the core
// promise. Desktop shows all six inline (Home stays reachable via the logo);
// the phone bottom bar keeps five thumb-reachable tabs and folds Discover/On TV
// into More. Every existing route is preserved as a destination or deep link —
// nothing is removed, only re-grouped.
// Desktop keeps five inline destinations (Home via the logo, Profile via the
// avatar in the right cluster) so the bar stays uncrowded; the phone bottom bar
// needs an explicit Profile tab because it has no avatar.
const DESKTOP_PRIMARY: NavLink[] = [
  { href: '/app/ask', label: 'Ask' },
  { href: '/app/watch', label: 'Discover' },
  { href: '/app/tv', label: 'On TV' },
  { href: '/app/watchlist', label: 'Saved' },
  { href: '/app/together', label: 'Together' },
];
const DESKTOP_SECONDARY: NavLink[] = [
  { href: '/app/new', label: 'New Releases' },
  { href: '/app/dna', label: 'Your Watch DNA' },
  { href: '/app/chambers', label: 'Chambers' },
  { href: '/app/subscriptions', label: 'Subscription check 💸' },
  { href: '/app/friends', label: 'Friends' },
  { href: '/app/reminders', label: 'My reminders' },
];

const MOBILE_PRIMARY: NavLink[] = [
  { href: '/app', label: 'Home' },
  { href: '/app/ask', label: 'Ask' },
  { href: '/app/watchlist', label: 'Saved' },
  { href: '/app/together', label: 'Together' },
  { href: '/app/settings', label: 'Profile' },
];
const MOBILE_SECONDARY: NavLink[] = [
  { href: '/app/watch', label: 'Discover' },
  { href: '/app/tv', label: 'On TV' },
  ...DESKTOP_SECONDARY,
];

export function Nav({
  personalLabel,
  isGuest = false,
  pro = false,
  avatarLabel = '🍿',
}: {
  personalLabel?: string | null;
  isGuest?: boolean;
  pro?: boolean;
  avatarLabel?: string;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/app" size="lg" />
            <nav className="hidden items-center gap-1 sm:flex">
              {DESKTOP_PRIMARY.map((l) => (
                <Link key={l.href} href={l.href} className="btn-ghost px-3 py-2 text-sm">
                  {l.label}
                </Link>
              ))}
              <MoreMenu links={DESKTOP_SECONDARY} />
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeToggle />
            <Link
              href="/app/pro"
              title="WatchVerdict Pro — AI-tuned verdicts, household profiles & more"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold-400/50 bg-gold-500/10 px-2.5 py-1.5 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/20"
            >
              <span aria-hidden className="text-base leading-none">⭐</span>
              <span className="hidden sm:inline">Pro</span>
            </Link>
            {personalLabel && !isGuest && (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 md:inline">
                {personalLabel}
              </span>
            )}
            {isGuest ? (
              <GuestSaveButton className="btn-primary hidden sm:inline-flex" />
            ) : (
              <>
                <SignOutButton className="btn-secondary hidden sm:inline-flex" />
                <Link
                  href="/app/settings"
                  aria-label={`Account${pro ? ' · Pro member' : ''}`}
                  title={pro ? 'Your account · Pro member' : 'Your account'}
                  className="ml-0.5 inline-flex"
                >
                  <Avatar label={avatarLabel} px={34} pro={pro} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — sibling of the header (NOT inside it): the header's
          backdrop-filter would otherwise become the containing block for this
          `fixed` element and pin it to the top of the screen. */}
      <MobileNav primary={MOBILE_PRIMARY} secondary={MOBILE_SECONDARY} />
    </>
  );
}
