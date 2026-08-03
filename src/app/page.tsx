import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Tagline } from '@/components/Tagline';
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
      {/* flex-wrap so the auth buttons drop below the logo lockup on narrow
          phones instead of forcing horizontal overflow. `xl` gives the mark
          and tagline the whole top-left corner — this page gives the logo a
          full line to itself, unlike the app header which shares one with
          search, account and overflow controls. */}
      <header className="container-page flex flex-wrap items-start justify-between gap-y-2 py-2 sm:gap-y-3 sm:py-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Logo size="xl" />
          <Tagline className="pl-[4.5rem] text-lg sm:pl-[5.75rem] sm:text-2xl lg:pl-[7rem] lg:text-3xl" />
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-4 lg:pt-6">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/app" className="btn-primary">
            Start watching
          </Link>
        </div>
      </header>

      <main>
        {/* THE CINEMATIC OPENING SCREEN. One centered column, not a
            two-column "pitch beside proof" layout — the proof moved below
            the fold as its own reveal (VerdictProcessPreview), which is what
            let this go back to a single ceremonial entrance and still fit
            comfortably above the fold on a laptop. */}
        <section className="relative isolate overflow-hidden">
          {/* THE ATMOSPHERE. Decorative only — aria-hidden, pointer-events
              none, behind everything. See its own doc comment in
              globals.css for what each layer is and isn't (no stock art, no
              invented poster). */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="wv-hero-glow absolute left-1/2 top-[-14%] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-cinema-radial blur-3xl" />
            <div
              className="wv-hero-card absolute left-[6%] top-[16%] hidden h-40 w-28 rounded-xl border border-white/[0.06] bg-white/[0.02] sm:block"
              style={{ '--wv-tilt': '-8deg' } as React.CSSProperties}
            />
            <div
              className="wv-hero-card absolute right-[8%] top-[8%] hidden h-48 w-32 rounded-xl border border-white/[0.05] bg-white/[0.015] sm:block"
              style={{ '--wv-tilt': '6deg', animationDelay: '-9s' } as React.CSSProperties}
            />
            <div
              className="wv-hero-card absolute bottom-[8%] right-[18%] hidden h-36 w-24 rounded-xl border border-white/[0.05] bg-white/[0.015] lg:block"
              style={{ '--wv-tilt': '10deg', animationDelay: '-17s' } as React.CSSProperties}
            />
            <div className="wv-hero-beam absolute left-[10%] top-0 h-full w-[220px] rotate-[9deg] bg-gradient-to-b from-gold-300/10 via-transparent to-transparent blur-2xl" />
            <div
              className="wv-hero-beam absolute right-[16%] top-0 h-full w-[180px] rotate-[-8deg] bg-gradient-to-b from-brand-400/10 via-transparent to-transparent blur-2xl"
              style={{ animationDelay: '-8s' }}
            />
          </div>

          {/* MOBILE: no forced min-height (it doesn't achieve real centering
              once content is taller than it, which it was) — packed tight
              instead, so the gold button lands near the middle of a phone
              screen through short, real gaps rather than empty flex space.
              DESKTOP (`sm:`) keeps the roomier spacing already verified to
              fit the first screen comfortably at 1440x900. */}
          <div className="container-page flex flex-col items-center justify-center py-4 text-center sm:min-h-[74vh] sm:py-14">
            <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Enter the courtroom.
            </h1>
            <p className="mx-auto mt-2 max-w-xl animate-fade-up text-lg text-slate-200 sm:mt-6 sm:text-xl">
              Tell us what you feel like watching. We&rsquo;ll weigh the evidence, match it to your taste, and hand
              down one clear Verd1ct—with exactly where to watch it.
            </p>

            {/* THE ONE WAY IN. ONE gold entry button, matching "enter the
                courtroom" — Build my Watch DNA and Import my history stay
                real, visible second-tier actions, but never compete with
                the entrance for the eye. */}
            <div className="mt-4 flex animate-fade-up flex-col items-center gap-2 sm:mt-10 sm:gap-3" data-testid="hero-ctas">
              <Link
                href="/app"
                className="wv-gold-breathe btn-courtroom px-10 py-3.5 text-lg transition hover:scale-[1.02] sm:px-14 sm:py-5 sm:text-xl"
                data-testid="cta-enter"
              >
                <span aria-hidden>⚖️</span> Enter the Courtroom
                <span aria-hidden className="wv-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </Link>
              <p className="text-xs text-slate-400 sm:text-sm">
                Search a title, describe your mood, or let WatchVerd1ct choose for you.
              </p>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:mt-2">
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

            {/* THE CLOSING LINE OF THE FIRST SCREEN. */}
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-slate-500 sm:mt-12">
              Thousands of titles. <span className="text-white">One Verd1ct.</span>
            </p>
          </div>
        </section>

        {/* THE PROOF, BELOW THE FOLD — see VerdictProcessPreview's own doc
            comment for why this is the process (evidence / taste / verdict),
            not a static mock result. */}
        <VerdictProcessPreview />

        {/* WHAT THE CONTROLS ON A REAL CARD MEAN — see HowYouRule's own doc
            comment: same icons and colors the real FOR/AGAINST/SAVE row and
            the gavel CTA use, illustrative rather than functional. */}
        <HowYouRule />
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
