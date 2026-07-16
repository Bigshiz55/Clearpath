import Link from 'next/link';
import { Logo } from './Logo';
import { SignOutButton } from './SignOutButton';
import { GuestSaveButton } from './GuestSaveButton';
import { SimpleModeToggle } from './SimpleModeToggle';

const LINKS = [
  { href: '/app', label: 'Home' },
  { href: '/app/new', label: 'New' },
  { href: '/app/tv', label: 'On TV' },
  { href: '/app/together', label: 'Together' },
  { href: '/app/watchlist', label: 'Watchlist' },
  { href: '/app/friends', label: 'Friends' },
  { href: '/app/chambers', label: 'Chambers' },
  { href: '/app/settings', label: 'Settings' },
];

export function Nav({ personalLabel, isGuest = false }: { personalLabel?: string | null; isGuest?: boolean }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/app" size="lg" />
            <nav className="hidden items-center gap-1 sm:flex">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="btn-ghost px-3 py-2 text-sm">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <SimpleModeToggle />
            {personalLabel && !isGuest && (
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 md:inline">
                {personalLabel}
              </span>
            )}
            {isGuest ? (
              <GuestSaveButton className="btn-primary hidden sm:inline-flex" />
            ) : (
              <SignOutButton className="btn-secondary hidden sm:inline-flex" />
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — sibling of the header (NOT inside it): the header's
          backdrop-filter would otherwise become the containing block for this
          `fixed` element and pin it to the top of the screen. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-white/10 bg-ink-950/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-xs text-slate-300">
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
