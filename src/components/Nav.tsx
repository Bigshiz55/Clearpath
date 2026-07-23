import Link from 'next/link';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';
import { GuestSaveButton } from './GuestSaveButton';
import { MoreMenu, type NavLink } from './nav/MoreMenu';
import { MobileNav } from './nav/MobileNav';
import { ViewModeToggle } from './ViewModeToggle';
import { Avatar } from './Avatar';

// Primary destinations stay inline; secondary ones live under "More" so neither
// the desktop bar nor the mobile tab bar gets overcrowded.
const PRIMARY: NavLink[] = [
  { href: '/app', label: 'Home' },
  { href: '/app/watch', label: 'Watch Now' },
  { href: '/app/new', label: 'New' },
  { href: '/app/on-tv', label: 'On TV' },
  { href: '/app/watchlist', label: 'Watchlist' },
];
const SECONDARY: NavLink[] = [
  { href: '/app/dna', label: 'Your Watch DNA' },
  { href: '/app/subscriptions', label: 'Subscription check 💸' },
  { href: '/app/together', label: 'Movie night together' },
  { href: '/app/reminders', label: 'My reminders' },
  { href: '/app/friends', label: 'Friends' },
  { href: '/app/chambers', label: 'Chambers' },
  { href: '/app/settings', label: 'Settings' },
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
              {PRIMARY.map((l) => (
                <Link key={l.href} href={l.href} className="btn-ghost px-3 py-2 text-sm">
                  {l.label}
                </Link>
              ))}
              <MoreMenu links={SECONDARY} />
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
      <MobileNav primary={PRIMARY} secondary={SECONDARY} />
    </>
  );
}
