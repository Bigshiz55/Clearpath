import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { BuildCaseBox } from '@/components/BuildCaseBox';
import { SearchBar } from '@/components/SearchBar';
import { MobileNav } from '@/components/nav/MobileNav';

/**
 * Mobile-home harness (gated by MOBILE_HARNESS=1). Renders the EXACT client
 * components that make up the /app home header + hero — Logo (wordmark),
 * BuildCaseBox (State Your Case), SearchBar, and the MobileNav bottom bar — so
 * Playwright can verify the rebuilt mobile homepage deterministically without an
 * authenticated Supabase session. It is a 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const PRIMARY = [
  { href: '/app', label: 'Home' },
  { href: '/app/watch', label: 'Watch Now' },
  { href: '/app/new', label: 'New' },
  { href: '/app/tv', label: 'On TV' },
  { href: '/app/watchlist', label: 'Watchlist' },
];
const SECONDARY = [
  { href: '/app/dna', label: 'Your Watch DNA' },
  { href: '/app/settings', label: 'Settings' },
];

export default function MobileHomeHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  return (
    <div className="min-h-dvh pb-20">
      <header
        data-testid="site-header"
        className="sticky top-0 z-40 border-b border-white/10 bg-ink-950/80 pt-[calc(env(safe-area-inset-top)+1.5rem)] backdrop-blur"
      >
        <div className="container-page flex h-16 items-center">
          <Logo href="/app" size="lg" />
        </div>
      </header>

      <main className="container-page space-y-6 py-6">
        <section className="space-y-3">
          <div className="text-center">
            <h1
              data-testid="hero-headline"
              className="text-[1.75rem] font-black leading-tight tracking-tight text-white sm:text-5xl"
            >
              What should we watch?
            </h1>
          </div>

          <BuildCaseBox hero />

          <div className="mx-auto max-w-xl">
            <SearchBar />
          </div>
        </section>
      </main>

      <MobileNav primary={PRIMARY} secondary={SECONDARY} />
    </div>
  );
}
