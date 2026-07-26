import Link from 'next/link';
import { Logo } from './Logo';
import { GuestSaveButton } from './GuestSaveButton';
import { MoreMenu, type NavLink } from './nav/MoreMenu';
import { MobileNav } from './nav/MobileNav';
import { HeaderOverflow } from './nav/HeaderOverflow';
import { Avatar } from './Avatar';

// Primary destinations stay inline; secondary ones live under "More" so neither
// the desktop bar nor the mobile tab bar gets overcrowded.
const PRIMARY: NavLink[] = [
  { href: '/app', label: 'Home' },
  { href: '/app/watch', label: 'Watch Now' },
  { href: '/app/new', label: 'New' },
  { href: '/app/tv', label: 'On TV' },
  { href: '/app/watchlist', label: 'Watchlist' },
];
const SECONDARY: NavLink[] = [
  { href: '/app/dna', label: 'Your Watch DNA' },
  { href: '/voice-dna', label: 'Voice DNA interview' },
  { href: '/import-taste', label: 'Bring your taste with you' },
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
      {/* Top padding clears the fixed build badge (~1.5rem band) so it never
          overlaps the logo or the header controls. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-2 sm:gap-4">
          {/* Spacing does NOT relax at wider viewports: `container-page` caps at
              1152px, so the header has exactly as much room at 1600 as at 1280.
              Restoring the roomier gaps above `xl` reintroduced the collision. */}
          <div className="flex min-w-0 items-center gap-3">
            <Logo href="/app" size="lg" />
            <nav className="hidden items-center gap-0.5 lg:flex">
              {PRIMARY.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="btn-ghost whitespace-nowrap px-2 py-2 text-sm"
                >
                  {l.label}
                </Link>
              ))}
              <MoreMenu links={SECONDARY} />
            </nav>
          </div>
          {/* The right cluster carries only what belongs in a header: upgrade,
              identity, account. The desktop-view switch and Sign out live in the
              overflow at every width — inline they cost ~220px, which is what
              pushed the primary nav past this column and under them. */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/app/pro"
              title="WatchVerdict Pro — AI-tuned verdicts, household profiles & more"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gold-400/50 bg-gold-500/10 px-2.5 py-1.5 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/20"
            >
              <span aria-hidden className="text-base leading-none">⭐</span>
              <span className="hidden sm:inline">Pro</span>
            </Link>
            {personalLabel && !isGuest && (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 lg:inline">
                {personalLabel}
              </span>
            )}
            {isGuest ? (
              <GuestSaveButton className="btn-primary hidden sm:inline-flex" />
            ) : (
              <Link
                href="/app/settings"
                aria-label={`Account${pro ? ' · Pro member' : ''}`}
                title={pro ? 'Your account · Pro member' : 'Your account'}
                className="ml-0.5 inline-flex"
              >
                <Avatar label={avatarLabel} px={34} pro={pro} />
              </Link>
            )}
            <HeaderOverflow personalLabel={personalLabel} isGuest={isGuest} />
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
