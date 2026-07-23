import Link from 'next/link';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';
import { GuestSaveButton } from './GuestSaveButton';
import { MoreMenu, type NavLink } from './nav/MoreMenu';
import { MobileNav } from './nav/MobileNav';
import { ViewModeToggle } from './ViewModeToggle';
import { Avatar } from './Avatar';
import { getServerI18n } from '@/i18n/server';

interface NavItem {
  href: string;
  key: string;
}

// Information architecture: the six jobs are Ask · Discover · On TV · Saved ·
// Together · Profile. "Ask" leads because deciding-what-to-watch is the core
// promise. Desktop shows all six inline (Home stays reachable via the logo);
// the phone bottom bar keeps five thumb-reachable tabs and folds Discover/On TV
// into More. Every existing route is preserved as a destination or deep link —
// nothing is removed, only re-grouped.
// Desktop keeps five inline destinations (Home via the logo, Profile via the
// avatar in the right cluster) so the bar stays uncrowded; the phone bottom bar
// needs an explicit Profile tab because it has no avatar.
const DESKTOP_PRIMARY: NavItem[] = [
  { href: '/app/ask', key: 'nav.ask' },
  { href: '/app/watch', key: 'nav.discover' },
  { href: '/app/tv', key: 'nav.onTv' },
  { href: '/app/watchlist', key: 'nav.saved' },
  { href: '/app/together', key: 'nav.together' },
];
const DESKTOP_SECONDARY: NavItem[] = [
  { href: '/app/new', key: 'nav.newReleases' },
  { href: '/app/dna', key: 'nav.watchDna' },
  { href: '/app/chambers', key: 'nav.chambers' },
  { href: '/app/subscriptions', key: 'nav.subscriptionCheck' },
  { href: '/app/friends', key: 'nav.friends' },
  { href: '/app/reminders', key: 'nav.reminders' },
];

const MOBILE_PRIMARY: NavItem[] = [
  { href: '/app', key: 'nav.home' },
  { href: '/app/ask', key: 'nav.ask' },
  { href: '/app/watchlist', key: 'nav.saved' },
  { href: '/app/together', key: 'nav.together' },
  { href: '/app/settings', key: 'nav.profile' },
];
const MOBILE_SECONDARY: NavItem[] = [
  { href: '/app/watch', key: 'nav.discover' },
  { href: '/app/tv', key: 'nav.onTv' },
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
  const { t } = getServerI18n();
  const tr = (items: NavItem[]): NavLink[] => items.map((i) => ({ href: i.href, label: t(i.key) }));
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/app" size="lg" />
            <nav className="hidden items-center gap-1 sm:flex">
              {tr(DESKTOP_PRIMARY).map((l) => (
                <Link key={l.href} href={l.href} className="btn-ghost px-3 py-2 text-sm">
                  {l.label}
                </Link>
              ))}
              <MoreMenu links={tr(DESKTOP_SECONDARY)} />
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
              <span className="hidden sm:inline">{t('nav.pro')}</span>
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
      <MobileNav primary={tr(MOBILE_PRIMARY)} secondary={tr(MOBILE_SECONDARY)} moreLabel={t('nav.more')} />
    </>
  );
}
