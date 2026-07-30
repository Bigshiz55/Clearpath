import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Tagline } from '@/components/Tagline';
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
      <header className="container-page flex flex-wrap items-start justify-between gap-y-3 py-6 sm:py-8">
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
        <section className="container-page py-16 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
            <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Enter the courtroom.
            </h1>
            <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg text-slate-300 sm:mt-8 lg:max-w-2xl lg:text-xl">
              Every title stands trial — scored two ways, a general recommendation and a match tuned
              to <em>your</em> taste — until you get a straight Verd1ct and exactly where to watch it.
            </p>
            {/* THE ONE WAY IN. The product does two things — answer tonight's
                question and learn who you are — but the hero now makes ONE
                ceremonial move, matching "enter the courtroom": ONE gold
                entry button. The second job (building Watch DNA) and every
                other route in stay reachable as quiet text links right below
                it, same as the import link always was — nothing lost, just
                no longer competing with the entrance for the eye. */}
            <div className="mt-10 flex animate-fade-up flex-col items-center gap-4 sm:mt-12 lg:mt-14" data-testid="hero-ctas">
              <Link href="/app" className="btn-courtroom px-10 py-4 text-lg sm:px-14 sm:py-5 sm:text-xl" data-testid="cta-enter">
                <span aria-hidden>⚖️</span> Enter the Courtroom
                <span aria-hidden className="wv-cta-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              </Link>
              <p className="text-xs text-slate-500 sm:text-sm">
                No account needed to look ·{' '}
                <Link href="/app/taste-quiz" className="underline underline-offset-2 hover:text-slate-300" data-testid="cta-dna">
                  {DNA_CTA[stage]}
                </Link>
                {' · '}
                <Link href="/import-taste" className="underline underline-offset-2 hover:text-slate-300" data-testid="cta-import">
                  already have a watch history? Import it
                </Link>
              </p>
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
