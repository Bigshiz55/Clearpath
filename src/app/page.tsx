import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { VerdictProcessPreview } from '@/components/landing/VerdictProcessPreview';
import { HowYouRule } from '@/components/landing/HowYouRule';
import { ExampleVerdict } from '@/components/landing/ExampleVerdict';
import { EnterWatchVerd1ctCta } from '@/components/landing/EnterWatchVerd1ctCta';
import { GroupVerdictSection } from '@/components/landing/GroupVerdictSection';
import { PacksSpotlight } from '@/components/landing/PacksSpotlight';
import { NeedSomethingSpecific } from '@/components/landing/NeedSomethingSpecific';
import { HomeArrivalBeacon } from '@/components/HomeArrivalBeacon';
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
      <HomeArrivalBeacon />
      {/* LOGO + SIGN IN, NOTHING ELSE. The "Enter WatchVerd1ct" button below
          is the one prominent entrance; a second, equally-weighted header
          button into `/app` would compete with it on every screen. Sign in
          stays because it's not a second front door, it's the same door for
          someone who already has an account. */}
      <header className="container-page flex flex-wrap items-center justify-between gap-y-1 py-1 sm:py-4">
        <Logo size="xl" />
        <Link href="/login" className="btn-ghost text-sm">
          Sign in
        </Link>
      </header>

      <main>
        {/* THE CENTRAL PROMISE. "Thousands of choices. 1 Verd1ct." is the
            headline itself now, not a small tagline under a different H1 —
            "1 Verd1ct" carries the brand's pink accent so the payoff reads
            as the decisive part of the sentence. No button here yet: the
            three cards below make the case first, then the one brand
            entrance appears once a visitor knows what it hands them. */}
        <section className="relative isolate overflow-hidden">
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

          <div className="container-page py-3.5 text-center sm:py-6">
            <h1 className="animate-fade-up text-4xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl" data-testid="hero-headline">
              THOUSANDS OF CHOICES.
              <br />
              <span className="text-[#ff1493]">1 VERD1CT.</span>
            </h1>
            <p className="mx-auto mt-1.5 max-w-xl animate-fade-up text-lg text-slate-200 sm:mt-3 sm:text-xl">
              Tell us what you feel like watching, who is watching, and what services you have. WatchVerd1ct weighs
              the evidence and gives you one confident choice.
            </p>
          </div>
        </section>

        {/* THE PROOF — evidence / taste / verdict, all at once. Always
            visible here (not tucked behind a tap) so a visitor understands
            the process before the gold button below asks for a click. */}
        <VerdictProcessPreview />

        {/* THE ONE WAY IN. The single brand entrance — blue→violet→magenta,
            not the courtroom's gold (that ceremony is reserved for the Live
            Jury / Verdict Room, never the front door). */}
        <section className="border-t border-white/10" data-testid="main-cta">
          <div className="container-page flex flex-col items-center py-8 text-center sm:py-8">
            <div className="flex flex-col items-center gap-2 sm:gap-3" data-testid="hero-ctas">
              <EnterWatchVerd1ctCta testId="cta-enter" />

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

        {/* PRODUCT PROOF — the REAL card (PosterCard and everything it
            carries), scored live, in its shipped anonymous state, followed by
            the one transition into the app. See ExampleVerdict's own doc
            comment for how each production component tells the truth about
            having no Taste DNA to work from. */}
        <ExampleVerdict />

        {/* WHAT THE CONTROLS ON A REAL CARD MEAN — supporting education,
            below the door and the proof, never a gate in front of either. */}
        <HowYouRule />

        {/* THE GROUP CASE — Verdict Room, a real working flow (useStartCourt)
            that combines participant taste profiles into one shared Verd1ct,
            not a second copy of the hero's pitch. */}
        <GroupVerdictSection />

        {/* PACKS' NOVEL VALUE, STATED PLAINLY — see PacksSpotlight's own
            doc comment. Sits right above the compact chip row below so a
            visitor reads what Packs actually do before the specific links. */}
        <PacksSpotlight />

        {/* SPECIALIZED SURFACES, COMPACT — Hallmark/Lifetime, true crime,
            live TV, new releases, subscription check, the full filter
            builder. All existing routes, just not competing with the
            entrance for primary attention. */}
        <NeedSomethingSpecific />
      </main>

      {/* TRUST, STATED POSITIVELY — what the product does, not a defense
          against a suspicion nobody raised. Same TMDB/JustWatch attribution
          as always underneath it. */}
      <footer className="border-t border-white/10">
        <div className="container-page py-5 text-center sm:py-6">
          <p className="mx-auto max-w-md text-sm font-semibold text-slate-200">
            Real ratings. Real availability. Transparent recommendations.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Every Verd1ct shows why it was selected, how confident the match is, and where it is currently
            available.{' '}
            <Link href="/app/tour" className="text-brand-300 underline hover:text-brand-200">
              See how it all works →
            </Link>
          </p>
          <div className="mx-auto mt-4 flex max-w-md flex-col items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:flex-row">
            <Logo compact />
            <p>
              Title data &amp; availability provided by{' '}
              <a href="https://www.themoviedb.org" className="text-brand-300 underline" rel="noopener noreferrer" target="_blank">
                TMDB
              </a>
              , JustWatch, and Watchmode. Ratings from IMDb, Rotten Tomatoes, and Metacritic, when available.
              WatchVerd1ct is not endorsed by TMDB.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
