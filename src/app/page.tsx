import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Tagline } from '@/components/Tagline';
import { HeroVerdictPreview } from '@/components/landing/HeroVerdictPreview';
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
      <header className="container-page flex flex-wrap items-start justify-between gap-y-3 py-5 sm:py-6">
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
        {/* TWO COLUMNS FROM `lg`: the pitch on the left, PROOF on the right.
            The old hero was words alone in a centered column with ~340px of
            empty space above and below it — a visitor had to already believe
            the promise to want the button. Showing an actual result card
            beside the promise answers "what do you mean, one clear verdict?"
            in the same five seconds the copy is asking for. */}
        <section className="container-page py-10 sm:py-14 lg:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-none lg:text-left">
              <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-6xl xl:text-7xl">
                Enter the courtroom.
              </h1>
              <p className="mx-auto mt-5 max-w-xl animate-fade-up text-lg text-slate-200 sm:mt-6 lg:mx-0 lg:text-xl">
                No more endless scrolling. Every title stands trial and gets ONE clear verdict — picked for you.
              </p>
              <p className="mx-auto mt-2 max-w-xl animate-fade-up text-base text-slate-400 sm:mt-3 lg:mx-0">
                Get one clear recommendation, matched to your taste, with exactly where to watch it.
              </p>

              {/* THE THREE THINGS THIS PAGE HAS TO PROVE IN FIVE SECONDS. */}
              <div className="mx-auto mt-5 flex max-w-md flex-wrap justify-center gap-2 sm:mt-6 lg:mx-0 lg:justify-start" data-testid="hero-proof-points">
                <span className="chip">
                  <span aria-hidden>⚖️</span> General Verdict
                </span>
                <span className="chip">
                  <span aria-hidden>🧬</span> Your Personal Match
                </span>
                <span className="chip">
                  <span aria-hidden>📺</span> Where to Watch
                </span>
              </div>

              {/* THE ONE WAY IN. The product does two things — answer tonight's
                  question and learn who you are — but the hero makes ONE
                  ceremonial move, matching "enter the courtroom": ONE gold
                  entry button. Building Watch DNA and importing history are
                  real second-tier CTAs now (small filled buttons, not buried
                  in an underlined text run) — still visibly secondary to the
                  gold button, but no longer easy to miss entirely. */}
              <div className="mx-auto mt-7 flex max-w-md animate-fade-up flex-col items-center gap-3 sm:mt-8 lg:mx-0 lg:items-start" data-testid="hero-ctas">
                <Link href="/app" className="btn-courtroom px-10 py-4 text-lg sm:px-14 sm:py-5 sm:text-xl" data-testid="cta-enter">
                  <span aria-hidden>⚖️</span> Enter the Courtroom
                  <span aria-hidden className="wv-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                </Link>
                <p className="text-xs text-slate-400 sm:text-sm">
                  Search a title, tell us what you feel like, or let us choose for you.
                </p>

                <div className="mt-1 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  <Link href="/app/taste-quiz" className="btn-secondary text-sm" data-testid="cta-dna">
                    {DNA_CTA[stage]}
                  </Link>
                  <Link href="/import-taste" className="btn-secondary text-sm" data-testid="cta-import">
                    Import my history
                  </Link>
                </div>

                <p className="text-xs text-slate-500">No account needed to explore.</p>
              </div>
            </div>

            {/* THE PROOF ITSELF — see HeroVerdictPreview's own doc comment for
                why this is a mock of the real card, not stock art. */}
            <div className="mx-auto w-full max-w-sm lg:mx-0 lg:max-w-none">
              <HeroVerdictPreview />
            </div>
          </div>
        </section>

        {/* THE THREE REASONS, ONE LINE EACH — not a feature list. This is the
            whole second pitch: stop scrolling, understand why, know where.
            Its own section (not folded into the footer) is what pushes the
            TMDB/JustWatch attribution line further down the page, so the
            footer reads as the page's quiet close rather than its next
            thing to look at. */}
        <section className="border-t border-white/10">
          <div className="container-page grid gap-8 py-10 sm:grid-cols-3 sm:py-12">
            <div className="text-center sm:text-left">
              <div className="text-2xl" aria-hidden>🛑</div>
              <h2 className="mt-2 text-base font-bold text-white">Stop scrolling</h2>
              <p className="mt-1 text-sm text-slate-400">One decision, not fifty options to weigh yourself.</p>
            </div>
            <div className="text-center sm:text-left">
              <div className="text-2xl" aria-hidden>🔍</div>
              <h2 className="mt-2 text-base font-bold text-white">Understand why a title fits</h2>
              <p className="mt-1 text-sm text-slate-400">Every verdict comes with a plain-English reason, not just a number.</p>
            </div>
            <div className="text-center sm:text-left">
              <div className="text-2xl" aria-hidden>📺</div>
              <h2 className="mt-2 text-base font-bold text-white">Know exactly where to watch</h2>
              <p className="mt-1 text-sm text-slate-400">See the exact streaming service before you commit — no guessing.</p>
            </div>
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
