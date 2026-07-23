import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { VerdictMark } from '@/components/icons';
import { DESKTOP_NAV, MOBILE_NAV } from '@/config/nav';
import { TopNavLink, TabNavLink } from './NavLink';

/**
 * The responsive application frame: a desktop top bar, a mobile bottom tab bar,
 * a skip link, and the main content region. Content is padded at the bottom on
 * mobile so the fixed tab bar never overlaps it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brass-500 focus:px-4 focus:py-2 focus:text-obsidian-950"
      >
        Skip to content
      </a>

      {/* Desktop / tablet top bar */}
      <header className="sticky top-0 z-40 border-b border-obsidian-700/70 bg-obsidian-950/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="ReadVerdict home">
            <VerdictMark className="h-8 w-8" />
            <span className="font-display text-lg font-bold tracking-tight text-ivory-50">
              Read<span className="text-brass-400">Verdict</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {DESKTOP_NAV.map((item) => (
              <TopNavLink key={item.href} item={item} />
            ))}
          </nav>

          <Link
            href="/ask"
            className="hidden rounded-lg bg-brass-500 px-4 py-2 text-sm font-semibold text-obsidian-950 shadow-brass transition hover:bg-brass-400 md:inline-flex"
          >
            Ask ReadVerdict
          </Link>
        </Container>
      </header>

      <main id="main" className="flex-1 pb-24 pt-8 md:pb-12">
        <Container>{children}</Container>
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-obsidian-700/70 bg-obsidian-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-content items-stretch justify-between gap-1 px-2 py-1">
          {MOBILE_NAV.map((item) => (
            <TabNavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>
    </div>
  );
}
