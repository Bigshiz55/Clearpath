import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { VerdictProcessPreview } from '@/components/landing/VerdictProcessPreview';
import { HowYouRule } from '@/components/landing/HowYouRule';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * How far along is this person's Watch DNA?
 *
 * Only enough to choose the wording of one button — deliberately cheap, and
 * deliberately fail-open: a signed-out visitor, or a database that will not
 * answer, gets the cold-start copy rather than an error page.
 */
async function dnaStage(): Promise<'none' | 'started' | 'developed'> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 'none';
    const { count } = await supabase
      .from('preference_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const n = count ?? 0;
    if (n >= 15) return 'developed';
    if (n > 0) return 'started';
    return 'none';
  } catch {
    return 'none';
  }
}

const DNA_CTA: Record<'none' | 'started' | 'developed', string> = {
  none: 'Build my Watch DNA',
  started: 'Keep building my Watch DNA',
  developed: 'Sharpen my Watch DNA',
};

export default async function LandingPage() {
  const stage = await dnaStage();
  return (
    <div className="min-h-dvh">
      {/* TIGHTER, LESS DOMINANT. flex-wrap so the auth buttons drop below the
          logo on narrow phones instead of forcing horizontal overflow. Logo
          size stays `xl` — its own responsive scale-up from tablet to
          desktop is pinned by a test — but the header's own padding is
          cut down so it reads as a strip, not a second hero. */}
      <header className="container-page flex flex-wrap items-center justify-between gap-y-1 py-1 sm:py-4">
        <Logo size="xl" />
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/app" className="btn-primary">
            Start watching
          </Link>
        </div>
      </header>

      <main>
        {/* THE INTRODUCTION — WHAT THIS IS, NOT YET A DOOR IN. The headline
            and the two lines under it are the whole first screen now; no
            button here at all. A giant gold CTA immediately under the
            headline used to be the very first thing a visitor's thumb could
            do, before they knew what "one clear Verd1ct" actually meant —
            this reads the pitch first, then the two explanation sections
            below make the case, and only then does the entrance appear. No
            forced min-height either: the section is exactly as tall as its
            own three lines of text need, so "How a Verd1ct Gets Made" starts
            within the same first scroll on a phone instead of behind an
            empty stretch of hero. */}
        <section className="relative isolate overflow-hidden">
          {/* THE ATMOSPHERE. Decorative only — aria-hidden, pointer-events
              none, behind everything. See its own doc comment in
              globals.css for what each layer is and isn't (no stock art, no
              invented poster). */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="wv-hero-glow absolute left-1/2 top-[-14%] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-cinema-radial blur-3xl" />
            <div
              className="wv-hero-card absolute left-[6%] top-[10%] hidden h-32 w-24 rounded-xl border border-white/[0.06] bg-white/[0.02] sm:block"
              style={{ '--wv-tilt': '-8deg' } as React.CSSProperties}
            />
            <div
              className="wv-hero-card absolute right-[8%] top-[4%] hidden h-36 w-28 rounded-xl border border-white/[0.05] bg-white/[0.015] sm:block"
              style={{ '--wv-tilt': '6deg', animationDelay: '-9s' } as React.CSSProperties}
            />
            <div className="wv-hero-beam absolute left-[10%] top-0 h-full w-[220px] rotate-[9deg] bg-gradient-to-b from-gold-300/10 via-transparent to-transparent blur-2xl" />
            <div
              className="wv-hero-beam absolute right-[16%] top-0 h-full w-[180px] rotate-[-8deg] bg-gradient-to-b from-brand-400/10 via-transparent to-transparent blur-2xl"
              style={{ animationDelay: '-8s' }}
            />
          </div>

          <div className="container-page py-4 text-center sm:py-8">
            <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Enter the courtroom.
            </h1>
            <p className="mx-auto mt-1.5 max-w-xl animate-fade-up text-lg text-slate-200 sm:mt-4 sm:text-xl">
              Tell us what you feel like watching. We&rsquo;ll weigh the evidence, match it to your taste, and hand
              down one clear Verd1ct—with exactly where to watch it.
            </p>
            <p className="mx-auto mt-2 max-w-md animate-fade-up text-base font-semibold text-slate-100 sm:mt-4 sm:text-lg">
              Search a title, describe your mood, or let WatchVerd1ct choose for you.
            </p>
          </div>
        </section>

        {/* THE PAYOFF LINE, RIGHT WHERE THE PITCH ENDS. Said exactly once on
            this page — see the header's own doc comment for why it no
            longer also opens the page above the fold. */}
        <p className="px-4 pb-1 text-center text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
          Thousands of titles. <span className="text-white">One Verd1ct.</span>
        </p>

        {/* THE PROOF — see VerdictProcessPreview's own doc comment for why
            this is the process (evidence / taste / verdict), shown all at
            once, not a static mock result or a tap-through rotator. */}
        <VerdictProcessPreview />

        {/* WHAT THE CONTROLS ON A REAL CARD MEAN — see HowYouRule's own doc
            comment: same icons and colors the real FOR/AGAINST/SAVE row and
            the gavel CTA use, illustrative rather than functional. */}
        <HowYouRule />

        {/* THE ONE WAY IN — the only "Enter the Courtroom" button on the
            whole page, and the first one a visitor has seen: by the time
            it appears they've read what a Verd1ct is, watched the process
            that builds one, and seen what the card controls mean. Build my
            Watch DNA and Import my history stay real, visible second-tier
            actions right under it, but never compete with the entrance for
            the eye. Shorter than the button used to be — tall enough to
            still read as the one thing on the page that matters, not so
            tall it reads as a banner ad. */}
        <section className="border-t border-white/10" data-testid="main-cta">
          <div className="container-page flex flex-col items-center py-6 text-center sm:py-10">
            <div className="flex flex-col items-center gap-2 sm:gap-3" data-testid="hero-ctas">
              <Link
                href="/app"
                className="wv-gold-breathe btn-courtroom px-9 py-3 text-base transition hover:scale-[1.02] sm:px-12 sm:py-4 sm:text-lg"
                data-testid="cta-enter"
              >
                <span aria-hidden>⚖️</span> Enter the Courtroom
                <span aria-hidden className="wv-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </Link>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/app/taste-quiz"
                  className="btn-secondary text-sm transition hover:scale-[1.03] hover:border-white/25"
                  data-testid="cta-dna"
                >
                  {DNA_CTA[stage]}
                </Link>
                <Link
                  href="/import-taste"
                  className="btn-secondary text-sm transition hover:scale-[1.03] hover:border-white/25"
                  data-testid="cta-import"
                >
                  Import my history
                </Link>
              </div>

              <p className="text-xs text-slate-500">No account needed to explore.</p>
            </div>
          </div>
        </section>

        {/* A SMALL CLOSING NOTE — trust, not another pitch. Anyone still
            reading this far already decided; this just says the data behind
            the Verd1ct they're about to get is real, and points at the
            fuller tour for anyone who wants the whole picture before they
            commit. */}
        <section className="border-t border-white/10">
          <div className="container-page py-6 text-center sm:py-8">
            <p className="mx-auto max-w-md text-xs text-slate-500">
              No fabricated scores or fake providers — every Verd1ct is built from real ratings and real
              availability.{' '}
              <Link href="/app/tour" className="text-brand-300 underline hover:text-brand-200">
                See how it all works →
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-8 text-sm text-slate-500 sm:flex-row">
          <Logo compact />
          <p>
            Title data & availability provided by{' '}
            <a href="https://www.themoviedb.org" className="text-brand-300 underline" rel="noopener noreferrer" target="_blank">
              TMDB
            </a>{' '}
            and JustWatch. WatchVerd1ct is not endorsed by TMDB.
          </p>
        </div>
      </footer>
    </div>
  );
}
