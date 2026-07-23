import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { VerdictBadge } from '@/components/ui/VerdictBadge';

const AREAS = [
  {
    href: '/ask',
    title: 'Ask ReadVerdict',
    body: 'Describe what you want in words or voice. Get a short, ranked set — not a wall of results.',
  },
  {
    href: '/discover',
    title: 'Discover',
    body: 'Editorially-shaped exploration tuned to your Reader DNA, not a popularity feed.',
  },
  {
    href: '/my-books',
    title: 'My Books',
    body: 'Saved, reading, finished, and DNF — with the intelligence to learn from each.',
  },
  {
    href: '/together',
    title: 'Read Together',
    body: 'Decide a book with a partner or club. Hard-nos come first; nobody is out-voted into misery.',
  },
];

export default function HomePage() {
  return (
    <div className="animate-fade-up space-y-16">
      <section className="pt-6 sm:pt-12">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-brass-400">
          Part of the Verdict family
        </p>
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-ivory-50 sm:text-6xl">
          The right book.
          <br />
          <span className="text-brass-400">Not more books.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ivory-300">
          Other services give you a bigger pile to choose from. ReadVerdict is a
          decision service — it reduces the choice to the book that fits exactly
          what you asked for, your taste, your time, and your format.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/ask" className="btn-brass">
            Ask ReadVerdict
          </Link>
          <Link href="/discover" className="btn-ghost">
            Explore Discover
          </Link>
        </div>

        <p className="mt-6 text-sm text-ivory-400">
          Foundation preview · features roll out in phases. Nothing here fabricates
          book data.
        </p>
      </section>

      {/* A representative verdict shell — illustrative of the target output, not real data. */}
      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="sr-only">
          What a verdict looks like
        </h2>
        <div className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.18em] text-ivory-400">
              Example verdict layout
            </p>
            <VerdictBadge tier="Strong Yes" />
          </div>
          <p className="mt-4 max-w-2xl font-display text-xl text-ivory-100">
            “A fast, twisty thriller under 350 pages, standalone, nothing
            supernatural.”
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {['Psychological thriller', 'Under 350 pages', 'Fast pacing', 'Standalone', 'No supernatural'].map(
              (chip) => (
                <span key={chip} className="pill">
                  {chip}
                </span>
              ),
            )}
          </div>
          <p className="mt-4 text-sm text-ivory-400">
            The interpretation chips above are editable — you stay in control of
            what ReadVerdict understood. Live results arrive in Phase 4.
          </p>
        </div>
      </section>

      <section aria-labelledby="areas-heading">
        <PageHeader
          eyebrow="Product areas"
          title="Built around decisions, not catalogs"
          description="Each surface serves the same goal: the right next read."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {AREAS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="card group p-6 transition hover:border-brass-500/40"
            >
              <h3 className="font-display text-xl font-semibold text-ivory-50 group-hover:text-brass-300">
                {a.title}
              </h3>
              <p className="mt-2 text-ivory-300">{a.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
