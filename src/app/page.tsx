import Link from 'next/link';
import { Logo } from '@/components/Logo';

const FEATURES = [
  {
    title: 'A verdict, not a shrug',
    body: 'Every title gets a clear call — Must Watch to Skip — with a one-line recommendation you can act on.',
  },
  {
    title: 'Tuned to your taste',
    body: 'A personal match score adjusts for what you love and what you avoid. Your profile, your rules.',
  },
  {
    title: 'Where to watch, legally',
    body: 'See streaming, rental, and purchase options for your region — with honest, up-to-date availability.',
  },
  {
    title: 'Share the call',
    body: 'Send a friend a verdict page. No account needed to open it.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo size="lg" />
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
          <Link href="/login" className="btn-primary">
            Get started
          </Link>
        </div>
      </header>

      <main>
        <section className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="chip mb-5 animate-fade-up">🍿 Stop scrolling. Get rolling.</span>
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
            <div className="mt-8 flex animate-fade-up items-center justify-center gap-3">
              <Link href="/login" className="btn-primary px-6 py-3 text-base">
                Create your account
              </Link>
              <a href="#how" className="btn-secondary px-6 py-3 text-base">
                How it works
              </a>
            </div>
            <p className="mt-4 text-xs text-slate-500">Free to use · Works on your phone · Install as an app</p>
          </div>
        </section>

        <section id="how" className="container-page pb-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6">
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.body}</p>
              </div>
            ))}
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
            <Link href="/login" className="btn-primary mt-6 px-6 py-3 text-base">
              Get started — it&apos;s free
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
