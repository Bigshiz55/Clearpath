import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { ScoreRing } from '@/components/ScoreRing';
import { VerdictBadge, DispositionChip } from '@/components/VerdictBadge';
import { ProviderRow } from '@/components/ProviderRow';
import { Poster } from '@/components/PosterCard';
import { getPublicShare } from '@/lib/share';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await getPublicShare(params.token);
  if (!snap) return { title: 'Verdict not found' };
  const title = `${snap.title}${snap.year ? ` (${snap.year})` : ''} — ${snap.tier}`;
  return {
    title,
    description: snap.oneLiner,
    openGraph: {
      title,
      description: snap.oneLiner,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title, description: snap.oneLiner },
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const snap = await getPublicShare(params.token);
  if (!snap) notFound();

  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <Link href="/login" className="btn-secondary">
          Create your own
        </Link>
      </header>

      <main className="container-page max-w-3xl py-6">
        <article className="space-y-5">
          <div className="card relative overflow-hidden">
            {snap.backdropUrl && (
              <div className="absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={snap.backdropUrl} alt="" className="h-full w-full object-cover opacity-25" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-850 via-ink-850/85 to-ink-850/40" />
              </div>
            )}
            <div className="relative flex flex-col gap-5 p-5 sm:flex-row">
              <div className="h-48 w-32 flex-shrink-0 overflow-hidden rounded-xl shadow-card">
                <Poster posterUrl={snap.posterUrl} title={snap.title} />
              </div>
              <div className="flex-1">
                <span className="chip">{snap.mediaType === 'movie' ? 'Movie' : 'TV Series'}</span>
                <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  {snap.title} {snap.year ? <span className="font-normal text-slate-400">({snap.year})</span> : null}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <VerdictBadge tier={snap.tier} size="lg" />
                  <DispositionChip disposition={snap.disposition} />
                </div>
                <p className="mt-3 text-slate-200">{snap.oneLiner}</p>
              </div>
            </div>
          </div>

          <div className="card flex flex-col items-center gap-6 p-6 sm:flex-row sm:justify-around">
            <ScoreRing score={snap.generalScore} label="WatchVerdict Score" accent="brand" />
            {snap.personal && (
              <>
                <div className="hidden h-24 w-px bg-white/10 sm:block" />
                <ScoreRing score={snap.personal.score} label={snap.personal.label} accent="gold" />
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-base font-semibold text-emerald-200">Why it may work</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {snap.reasonsFor.map((r, i) => (
                  <li key={i} className="flex gap-2"><span className="text-emerald-400">+</span>{r}</li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="text-base font-semibold text-red-200">Why it may not</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {snap.reasonsAgainst.map((r, i) => (
                  <li key={i} className="flex gap-2"><span className="text-red-400">–</span>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-base font-semibold text-white">Where to watch</h3>
            <div className="mt-3">
              <ProviderRow providers={snap.providers} />
            </div>
          </div>

          <div className="card bg-cinema-radial p-6 text-center">
            <h2 className="text-xl font-bold text-white">Want verdicts tuned to your taste?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
              WatchVerdict scores any movie or show for you personally and tells you where to watch it.
            </p>
            <Link href="/login" className="btn-primary mt-4 inline-flex px-6 py-3">
              Create your free account
            </Link>
          </div>
        </article>
      </main>

      <footer className="container-page py-8 text-center text-xs text-slate-500">
        Shared via WatchVerdict · Data from TMDB / JustWatch
      </footer>
    </div>
  );
}
