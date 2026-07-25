import Link from 'next/link';
import { WatchVerdictWordmark } from '@/components/WatchVerdictWordmark';
import { Tagline } from '@/components/Tagline';
import type { DiscoveryPage } from '@/lib/discovery/types';

/**
 * The shared public-page shell and body renderer. One template drives every
 * editorial route, which is what makes this a publishing system rather than a
 * pile of pages. Premium and cinematic, mobile-first, semantic HTML, and no
 * courtroom theatre — light Verd1ct language only.
 */

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/guides/how-watchverd1ct-works', label: 'How it works' },
  { href: '/explore', label: 'Explore' },
  { href: '/for/couples', label: 'For couples' },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/85 backdrop-blur">
      <div className="container-page flex min-h-14 flex-wrap items-center gap-x-6 gap-y-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <Link href="/" className="text-base font-bold" aria-label="WatchVerd1ct home">
          <WatchVerdictWordmark />
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-slate-300 transition hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/login" className="ml-auto whitespace-nowrap rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10">
          Sign in
        </Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 py-10">
      <div className="container-page space-y-4">
        <Tagline className="text-sm" />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
          <Link href="/explore" className="hover:text-white">Explore</Link>
          <Link href="/guides/how-watchverd1ct-works" className="hover:text-white">How it works</Link>
          <Link href="/compare/imdb" className="hover:text-white">Comparisons</Link>
          <Link href="/for/movie-night" className="hover:text-white">What to watch tonight</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </nav>
        <p className="text-xs text-slate-500">
          Ratings and availability come from third-party sources and are labelled with their confidence. WatchVerd1ct never fabricates scores or availability.
        </p>
      </div>
    </footer>
  );
}

export function Breadcrumbs({ trail }: { trail: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
      <ol className="flex flex-wrap items-center gap-1.5">
        {trail.map((t, i) => (
          <li key={t.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-slate-600">/</span>}
            {i === trail.length - 1 ? (
              <span aria-current="page" className="text-slate-300">{t.label}</span>
            ) : (
              <Link href={t.href} className="hover:text-white">{t.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Renders one editorial page body. */
export function DiscoveryArticle({ page, trail }: { page: DiscoveryPage; trail: { href: string; label: string }[] }) {
  return (
    <article className="container-page py-8" data-testid="discovery-article">
      <Breadcrumbs trail={trail} />
      <header className="mt-4 max-w-3xl">
        <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">{page.heading}</h1>
        <p className="mt-3 text-lg text-slate-300">{page.standfirst}</p>
        <p className="mt-3 text-xs text-slate-500">
          Updated <time dateTime={page.updated}>{page.updated}</time> · WatchVerd1ct editorial
        </p>
      </header>

      {page.sections.length > 2 && (
        <nav aria-label="On this page" className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">On this page</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {page.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#s${i}`} className="text-brand-200 hover:text-white">{s.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="mt-8 max-w-3xl space-y-8">
        {page.sections.map((s, i) => (
          <section key={s.heading} id={`s${i}`} className="scroll-mt-20">
            <h2 className="text-xl font-bold text-white sm:text-2xl">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-slate-300">{p}</p>
            ))}
            {s.bullets && s.bullets.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {s.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-slate-300">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-brand-400" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="mt-12 max-w-3xl rounded-2xl border border-brand-400/30 bg-brand-500/[0.08] p-6" data-testid="discovery-cta">
        <h2 className="text-xl font-bold text-white">Thousands of titles. One Verd1ct.</h2>
        <p className="mt-2 text-slate-300">
          Tell WatchVerd1ct what you are in the mood for, who is watching and which services you have. It finds the
          strongest choice, explains why it fits and tells you where to watch it.
        </p>
        <Link
          href={page.cta.href}
          data-testid="cta-primary"
          data-cta={`${page.kind}:${page.slug}`}
          className="btn-primary mt-4 inline-flex px-6"
        >
          {page.cta.label}
        </Link>
      </section>

      {page.faq.length > 0 && (
        <section className="mt-12 max-w-3xl" data-testid="discovery-faq">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Frequently asked questions</h2>
          <dl className="mt-4 space-y-5">
            {page.faq.map((f) => (
              <div key={f.question}>
                <dt className="font-semibold text-white">{f.question}</dt>
                <dd className="mt-1 leading-relaxed text-slate-300">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {page.related.length > 0 && (
        <nav aria-label="Related pages" className="mt-12 max-w-3xl" data-testid="discovery-related">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Keep reading</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {page.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="block rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.06]">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </article>
  );
}
