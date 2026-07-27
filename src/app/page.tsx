import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Tagline } from '@/components/Tagline';
import { PromiseBar } from '@/components/PromiseBar';
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
      <PromiseBar />
      {/* flex-wrap so the auth buttons drop below the logo lockup on narrow
          phones instead of forcing horizontal overflow. */}
      <header className="container-page flex flex-wrap items-start justify-between gap-y-2 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Logo size="lg" />
          {/* Tagline tucked under the wordmark — a proper logo lockup. */}
          <Tagline className="pl-[3.75rem] text-base sm:text-lg" />
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1.5">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/app" className="btn-primary">
            Start watching
          </Link>
        </div>
      </header>

      <main>
        <section className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              Should you watch it?
              <span className="block bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">
                Get a straight answer.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg text-slate-300">
              WatchVerdict scores any movie or show two ways — a general recommendation and a match
              tuned to <em>your</em> taste — then tells you exactly where to watch it.
            </p>
            {/* Exactly two calls to action, because the product does exactly two
                things: answer tonight's question, and learn who you are. Every
                other route in is a text link, not a button. */}
            <div className="mt-8 flex animate-fade-up flex-wrap items-center justify-center gap-3" data-testid="hero-ctas">
              <Link href="/app" className="btn-primary px-6 py-3 text-base" data-testid="cta-find">
                Find something to watch
              </Link>
              <Link href="/app/taste-quiz" className="btn-pulse px-6 py-3 text-base" data-testid="cta-dna">
                {DNA_CTA[stage]}
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              No account needed to look ·{' '}
              <Link href="/import-taste" className="underline underline-offset-2 hover:text-slate-300" data-testid="cta-import">
                already have a watch history? Import it
              </Link>
            </p>
          </div>
        </section>

        <section className="container-page pb-24">
          <div className="card overflow-hidden bg-cinema-radial p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Stop scrolling. Start watching the right thing.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-300">
              Build a watchlist that reflects your taste, and share your verdicts with the people you
              watch with.
            </p>
            <Link href="/app" className="btn-primary mt-6 px-6 py-3 text-base">
              Get started — no signup
            </Link>
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
            and JustWatch. WatchVerdict is not endorsed by TMDB.
          </p>
        </div>
      </footer>
    </div>
  );
}
