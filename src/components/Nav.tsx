import Link from 'next/link';
import { Logo } from './Logo';
import { GuestSaveButton } from './GuestSaveButton';
import { MoreMenu, type NavLink } from './nav/MoreMenu';
import { MobileNav } from './nav/MobileNav';
import { HeaderOverflow } from './nav/HeaderOverflow';
import { Avatar } from './Avatar';
import { QuickSearchTrigger } from './QuickSearch';

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
  { href: '/app/verdict', label: 'The Verd1ct 🔨' },
  { href: '/app/dna', label: 'Your Watch DNA' },
  { href: '/app/taste-quiz', label: 'Quick Taste Quiz' },
  { href: '/app/rapid-fire', label: 'Rapid Fire ⚡️' },
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
      {/* Top padding clears the build badge band so it never overlaps the logo
          or the header controls.

          NOT STICKY ON A PHONE. Header + badge is ~148px, and sticking it means
          148px of every screen is permanently spent on chrome — card titles
          slide under it the moment you scroll, which is the "it chops off the
          top" complaint. On mobile the bottom nav is welded to the edge and
          already carries navigation, so a second persistent bar earns nothing.
          It scrolls away with the content and comes straight back at the top.
          From `sm` there is no bottom nav, so it sticks as before. */}
      <header className="relative z-40 border-b border-white/10 bg-ink-950/80 pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur sm:sticky sm:top-0">
        <div className="container-page flex h-14 items-center justify-between gap-2 sm:h-16 sm:gap-4">
          {/* Spacing does NOT relax at wider viewports. The tightest fit is a
              1280px window (container ≈ 1232), and roomier gaps above `xl`
              reintroduced the collision there. The container now widens on big
              desktops, but a layout that only fits when the window is huge is
              still broken at 1280 — so the compact spacing stays. */}
          <div className="flex min-w-0 items-center gap-3">
            <Logo href="/app" size="lg" crowded />
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
            {/* Search belongs in the header at every width — "a search button
                that's always there no matter what screen you're on". Once this
                one scrolls off on a phone, QuickSearch floats a replacement. */}
            <QuickSearchTrigger />
            {/* PRO STEPS ASIDE ON A PHONE. The header holds a logo and three
                controls at 390px and no more — adding a fifth put the search
                button under the wordmark. Search is worth more from every
                screen than an upsell is; Pro keeps its place from `sm` and is
                in the overflow menu below at every width. */}
            <Link
              href="/app/pro"
              title="WatchVerdict Pro — AI-tuned verdicts, household profiles & more"
              className="hidden items-center gap-1.5 rounded-lg border border-gold-400/50 bg-gold-500/10 px-2.5 py-1.5 text-sm font-semibold text-gold-100 transition hover:bg-gold-500/20 sm:inline-flex"
            >
              <span aria-hidden className="text-base leading-none">⭐</span>
              <span className="hidden sm:inline">Pro</span>
            </Link>
            {/* THE IDENTITY CHIP IS NOT INLINE ANY MORE. Measured at the
                tightest real width (a 1280px window), the primary nav ends at
                958 while this cluster starts at 952 — the chip was the ~115px
                in the middle. Wider desktops now get a wider container, but
                the chip must fit at 1280 too, so it lives in the overflow menu
                at every width — where a label you read once belongs. */}
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
